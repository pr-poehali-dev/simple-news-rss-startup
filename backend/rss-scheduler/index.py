import os
import json
import psycopg2
import urllib.request
import xml.etree.ElementTree as ET
import re
from datetime import datetime, timezone, timedelta
from email.utils import parsedate_to_datetime


def clean_html(text: str) -> str:
    if not text:
        return ""
    clean = re.sub(r'<[^>]+>', '', text)
    clean = re.sub(r'&amp;', '&', clean)
    clean = re.sub(r'&lt;', '<', clean)
    clean = re.sub(r'&gt;', '>', clean)
    clean = re.sub(r'&nbsp;', ' ', clean)
    clean = re.sub(r'&#\d+;', '', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean[:500]


def extract_image(item_el, ns: dict) -> str:
    for tag in ['media:content', 'media:thumbnail']:
        el = item_el.find(tag, ns)
        if el is not None:
            url = el.get('url', '')
            if url:
                return url
    enclosure = item_el.find('enclosure')
    if enclosure is not None:
        t = enclosure.get('type', '')
        if t.startswith('image'):
            return enclosure.get('url', '')
    desc = item_el.findtext('description', '')
    img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc or '')
    if img_match:
        return img_match.group(1)
    return ''


def parse_date(date_str: str):
    if not date_str:
        return datetime.now(timezone.utc)
    try:
        return parsedate_to_datetime(date_str)
    except Exception:
        pass
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except Exception:
        pass
    return datetime.now(timezone.utc)


def fetch_and_save(cur, schema: str, src_id: int, url: str, category: str) -> dict:
    req = urllib.request.Request(url, headers={'User-Agent': 'GameFeed RSS Scheduler/1.0'})
    with urllib.request.urlopen(req, timeout=15) as response:
        content = response.read()

    ns = {
        'media': 'http://search.yahoo.com/mrss/',
        'content': 'http://purl.org/rss/1.0/modules/content/',
        'dc': 'http://purl.org/dc/elements/1.1/',
    }
    root = ET.fromstring(content)
    channel = root.find('channel')
    if channel is None:
        channel = root

    added = 0
    for item_el in channel.findall('item')[:20]:
        title = clean_html(item_el.findtext('title', ''))
        link = item_el.findtext('link', '') or ''
        guid = item_el.findtext('guid', '') or link
        desc = item_el.findtext('description', '') or item_el.findtext('{http://purl.org/rss/1.0/modules/content/}encoded', '')
        excerpt = clean_html(desc)
        pub_date = item_el.findtext('pubDate', '') or item_el.findtext('{http://purl.org/dc/elements/1.1/}date', '')
        image_url = extract_image(item_el, ns)
        published_at = parse_date(pub_date)

        if not title or not guid:
            continue

        cur.execute(
            f"""INSERT INTO {schema}.news_items
                (source_id, guid, title, excerpt, url, image_url, category, published_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (guid) DO NOTHING""",
            (src_id, guid, title, excerpt, link, image_url, category, published_at)
        )
        if cur.rowcount > 0:
            added += 1

    cur.execute(
        f"UPDATE {schema}.rss_sources SET last_fetched_at = NOW() WHERE id = %s",
        (src_id,)
    )
    return {'added': added}


def handler(event: dict, context) -> dict:
    """
    Автоматический планировщик RSS-обновлений.
    Запускает парсинг только если прошло больше 30 минут с последнего обновления.
    Вызывается с фронтенда при загрузке страницы (тихо, в фоне).
    GET /?force=1 — принудительное обновление
    GET / — обновление только если давно не обновлялось
    """
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            'body': ''
        }

    params = event.get('queryStringParameters') or {}
    force = params.get('force', '0') == '1'
    interval_minutes = int(params.get('interval', '30'))

    schema = os.environ['MAIN_DB_SCHEMA']
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # Проверяем когда последний раз обновлялись
    cur.execute(
        f"SELECT MAX(last_fetched_at) FROM {schema}.rss_sources WHERE active = true"
    )
    last_fetched = cur.fetchone()[0]

    now = datetime.now(timezone.utc)
    should_run = force

    if not should_run:
        if last_fetched is None:
            should_run = True
        else:
            if last_fetched.tzinfo is None:
                last_fetched = last_fetched.replace(tzinfo=timezone.utc)
            elapsed = now - last_fetched
            should_run = elapsed > timedelta(minutes=interval_minutes)

    if not should_run:
        if last_fetched and last_fetched.tzinfo is None:
            last_fetched = last_fetched.replace(tzinfo=timezone.utc)
        elapsed_sec = int((now - last_fetched).total_seconds()) if last_fetched else 0
        next_run_sec = max(0, interval_minutes * 60 - elapsed_sec)
        cur.close()
        conn.close()
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
            'body': json.dumps({
                'ok': True,
                'skipped': True,
                'reason': f'Updated {elapsed_sec // 60} min ago, next in {next_run_sec // 60} min',
                'last_fetched': last_fetched.isoformat() if last_fetched else None,
                'next_run_in_seconds': next_run_sec,
            })
        }

    # Запускаем парсинг
    cur.execute(f"SELECT id, url, category FROM {schema}.rss_sources WHERE active = true")
    sources = cur.fetchall()

    total_added = 0
    results = []

    for src_id, url, category in sources:
        try:
            result = fetch_and_save(cur, schema, src_id, url, category)
            total_added += result['added']
            results.append({'source_id': src_id, 'added': result['added'], 'error': None})
        except Exception as e:
            results.append({'source_id': src_id, 'added': 0, 'error': str(e)[:200]})

    conn.commit()
    cur.close()
    conn.close()

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({
            'ok': True,
            'skipped': False,
            'total_added': total_added,
            'sources_checked': len(sources),
            'ran_at': now.isoformat(),
            'results': results,
        })
    }

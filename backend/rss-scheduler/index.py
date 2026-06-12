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
    return clean[:600]


def extract_image(item_el, ns: dict) -> str:
    for tag in ['media:content', 'media:thumbnail']:
        el = item_el.find(tag, ns)
        if el is not None:
            url = el.get('url', '')
            if url:
                return url
    enclosure = item_el.find('enclosure')
    if enclosure is not None:
        if enclosure.get('type', '').startswith('image'):
            return enclosure.get('url', '')
    desc = item_el.findtext('description', '')
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', desc or '')
    return m.group(1) if m else ''


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


def translate_batch(items: list, api_key: str) -> list:
    """Переводит список {'title': ..., 'excerpt': ...} через OpenAI gpt-4o-mini батчем."""
    if not items or not api_key:
        return [{'title_ru': i['title'], 'excerpt_ru': i['excerpt']} for i in items]

    texts = []
    for idx, item in enumerate(items):
        texts.append(f"[{idx}] TITLE: {item['title']}\nEXCERPT: {item['excerpt'][:300]}")

    prompt = (
        "Переведи на русский язык следующие игровые новости. "
        "Для каждой верни объект с полями title_ru и excerpt_ru. "
        'Верни JSON вида {"translations": [{...}, ...]} без лишнего текста.\n\n'
        + "\n\n".join(texts)
    )

    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "response_format": {"type": "json_object"}
    }).encode()

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        data = json.loads(resp.read())

    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)

    # Нормализуем: может быть {"translations": [...]} или сразу [...]
    if isinstance(parsed, dict):
        for key in parsed:
            if isinstance(parsed[key], list):
                parsed = parsed[key]
                break

    results = []
    for idx, item in enumerate(items):
        if isinstance(parsed, list) and idx < len(parsed):
            r = parsed[idx]
            results.append({
                'title_ru': r.get('title_ru') or item['title'],
                'excerpt_ru': r.get('excerpt_ru') or item['excerpt'],
            })
        else:
            results.append({'title_ru': item['title'], 'excerpt_ru': item['excerpt']})
    return results


def fetch_and_save(cur, schema: str, src_id: int, url: str, category: str, api_key: str) -> dict:
    req = urllib.request.Request(url, headers={'User-Agent': 'GameFeed RSS Scheduler/1.0'})
    with urllib.request.urlopen(req, timeout=15) as response:
        content = response.read()

    ns = {'media': 'http://search.yahoo.com/mrss/'}
    root = ET.fromstring(content)
    channel = root.find('channel') or root

    raw_items = []
    for item_el in channel.findall('item')[:20]:
        title = clean_html(item_el.findtext('title', ''))
        link = item_el.findtext('link', '') or ''
        guid = item_el.findtext('guid', '') or link
        desc = (item_el.findtext('description', '')
                or item_el.findtext('{http://purl.org/rss/1.0/modules/content/}encoded', ''))
        excerpt = clean_html(desc)
        pub_date = (item_el.findtext('pubDate', '')
                    or item_el.findtext('{http://purl.org/dc/elements/1.1/}date', ''))
        image_url = extract_image(item_el, ns)
        published_at = parse_date(pub_date)
        if not title or not guid:
            continue

        # Пропускаем уже существующие
        cur.execute(f"SELECT id FROM {schema}.news_items WHERE guid = %s", (guid,))
        if cur.fetchone():
            continue

        raw_items.append({
            'guid': guid, 'title': title, 'excerpt': excerpt,
            'url': link, 'image_url': image_url, 'published_at': published_at,
        })

    if not raw_items:
        return {'added': 0}

    # Переводим батчем (все новые статьи из этого источника за раз)
    if api_key:
        try:
            translated = translate_batch(raw_items, api_key)
        except Exception:
            translated = [{'title_ru': i['title'], 'excerpt_ru': i['excerpt']} for i in raw_items]
    else:
        translated = [{'title_ru': i['title'], 'excerpt_ru': i['excerpt']} for i in raw_items]

    added = 0
    for item, tr in zip(raw_items, translated):
        cur.execute(
            f"""INSERT INTO {schema}.news_items
                (source_id, guid, title, excerpt, title_ru, excerpt_ru, translated,
                 url, image_url, category, published_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (guid) DO NOTHING""",
            (src_id, item['guid'], item['title'], item['excerpt'],
             tr['title_ru'], tr['excerpt_ru'], bool(api_key),
             item['url'], item['image_url'], category, item['published_at'])
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
    Автоматический планировщик RSS с переводом на русский через OpenAI gpt-4o-mini.
    GET /          — запуск только если прошло > 30 мин
    GET /?force=1  — принудительный запуск
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

    api_key = os.environ.get('OPENAI_API_KEY', '')
    schema = os.environ['MAIN_DB_SCHEMA']
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # Проверяем время последнего обновления
    cur.execute(f"SELECT MAX(last_fetched_at) FROM {schema}.rss_sources WHERE active = true")
    last_fetched = cur.fetchone()[0]
    now = datetime.now(timezone.utc)
    should_run = force

    if not should_run:
        if last_fetched is None:
            should_run = True
        else:
            if last_fetched.tzinfo is None:
                last_fetched = last_fetched.replace(tzinfo=timezone.utc)
            should_run = (now - last_fetched) > timedelta(minutes=interval_minutes)

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
                'ok': True, 'skipped': True,
                'next_run_in_seconds': next_run_sec,
                'last_fetched': last_fetched.isoformat() if last_fetched else None,
            })
        }

    cur.execute(f"SELECT id, url, category FROM {schema}.rss_sources WHERE active = true")
    sources = cur.fetchall()
    total_added = 0
    results = []

    for src_id, url, category in sources:
        try:
            result = fetch_and_save(cur, schema, src_id, url, category, api_key)
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
            'ok': True, 'skipped': False,
            'total_added': total_added,
            'translated': bool(api_key),
            'ran_at': now.isoformat(),
            'results': results,
        })
    }

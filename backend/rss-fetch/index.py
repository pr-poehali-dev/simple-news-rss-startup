import os
import json
import psycopg2
import urllib.request
import xml.etree.ElementTree as ET
import re
from datetime import datetime, timezone
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


def fetch_rss(url: str) -> list:
    req = urllib.request.Request(url, headers={'User-Agent': 'GameFeed RSS Reader/1.0'})
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
    items = []
    for item_el in channel.findall('item')[:20]:
        title = clean_html(item_el.findtext('title', ''))
        link = item_el.findtext('link', '') or item_el.findtext('{http://www.w3.org/2005/Atom}link', '')
        guid = item_el.findtext('guid', '') or link
        desc = item_el.findtext('description', '') or item_el.findtext('{http://purl.org/rss/1.0/modules/content/}encoded', '')
        excerpt = clean_html(desc)
        pub_date = item_el.findtext('pubDate', '') or item_el.findtext('{http://purl.org/dc/elements/1.1/}date', '')
        image_url = extract_image(item_el, ns)
        published_at = parse_date(pub_date)
        if title and guid:
            items.append({
                'guid': guid,
                'title': title,
                'excerpt': excerpt,
                'url': link,
                'image_url': image_url,
                'published_at': published_at,
            })
    return items


def handler(event: dict, context) -> dict:
    """Парсит RSS-источники и сохраняет новые статьи в БД. Вызывается периодически."""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type',
            },
            'body': ''
        }

    schema = os.environ['MAIN_DB_SCHEMA']
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    source_id = None
    if event.get('queryStringParameters'):
        source_id = event['queryStringParameters'].get('source_id')

    if source_id:
        cur.execute(f"SELECT id, url, category FROM {schema}.rss_sources WHERE id = %s AND active = true", (source_id,))
    else:
        cur.execute(f"SELECT id, url, category FROM {schema}.rss_sources WHERE active = true")

    sources = cur.fetchall()
    total_added = 0
    results = []

    for src_id, url, category in sources:
        added = 0
        error = None
        try:
            items = fetch_rss(url)
            for item in items:
                cur.execute(
                    f"""INSERT INTO {schema}.news_items
                        (source_id, guid, title, excerpt, url, image_url, category, published_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (guid) DO NOTHING""",
                    (src_id, item['guid'], item['title'], item['excerpt'],
                     item['url'], item['image_url'], category, item['published_at'])
                )
                if cur.rowcount > 0:
                    added += 1
            cur.execute(
                f"UPDATE {schema}.rss_sources SET last_fetched_at = NOW() WHERE id = %s",
                (src_id,)
            )
            total_added += added
        except Exception as e:
            error = str(e)
        results.append({'source_id': src_id, 'added': added, 'error': error})

    conn.commit()
    cur.close()
    conn.close()

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({'ok': True, 'total_added': total_added, 'sources': results})
    }

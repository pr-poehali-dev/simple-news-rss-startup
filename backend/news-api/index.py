import os
import json
import psycopg2
from datetime import datetime, timezone


def serialize(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    return str(obj)


def time_ago(pub):
    if not pub:
        return ""
    now = datetime.now(timezone.utc)
    if pub.tzinfo is None:
        pub = pub.replace(tzinfo=timezone.utc)
    diff = now - pub
    if diff.days == 0:
        h = diff.seconds // 3600
        m = diff.seconds // 60
        if h > 0:
            return f"{h} {'час' if h == 1 else ('часа' if 2 <= h <= 4 else 'часов')} назад"
        return f"{m} мин назад" if m > 0 else "только что"
    if diff.days == 1:
        return "1 день назад"
    if diff.days < 7:
        return f"{diff.days} {'дня' if 2 <= diff.days <= 4 else 'дней'} назад"
    return pub.strftime("%d.%m.%Y")


def handler(event: dict, context) -> dict:
    """
    Возвращает список новостей или одну новость по id.
    GET /           — список с фильтрацией
    GET /?id=X      — одна новость по id
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

    schema = os.environ['MAIN_DB_SCHEMA']
    params = event.get('queryStringParameters') or {}
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    # Одна новость по id
    news_id = params.get('id')
    if news_id:
        cur.execute(
            f"""SELECT n.id, n.title, n.title_ru, n.excerpt, n.excerpt_ru,
                       n.url, n.image_url, n.category, n.published_at,
                       n.translated, s.name as source_name, s.url as source_url
                FROM {schema}.news_items n
                LEFT JOIN {schema}.rss_sources s ON s.id = n.source_id
                WHERE n.id = %s""",
            (news_id,)
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return {
                'statusCode': 404,
                'headers': {'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'ok': False, 'error': 'Not found'})
            }
        # Соседние новости (prev/next)
        conn2 = psycopg2.connect(os.environ['DATABASE_URL'])
        cur2 = conn2.cursor()
        cur2.execute(
            f"SELECT id, title_ru, title FROM {schema}.news_items WHERE id < %s ORDER BY id DESC LIMIT 1",
            (news_id,)
        )
        prev_row = cur2.fetchone()
        cur2.execute(
            f"SELECT id, title_ru, title FROM {schema}.news_items WHERE id > %s ORDER BY id ASC LIMIT 1",
            (news_id,)
        )
        next_row = cur2.fetchone()
        cur2.close()
        conn2.close()

        pub = row[8]
        item = {
            'id': row[0],
            'title': row[2] or row[1],       # title_ru если есть
            'title_original': row[1],
            'excerpt': row[4] or row[3] or '',  # excerpt_ru если есть
            'url': row[5],
            'image': row[6] or '',
            'category': row[7] or 'Общее',
            'published_at': serialize(pub),
            'time': time_ago(pub),
            'translated': row[9] or False,
            'source': row[10] or '',
            'source_url': row[11] or '',
            'prev': {'id': prev_row[0], 'title': prev_row[1] or prev_row[2]} if prev_row else None,
            'next': {'id': next_row[0], 'title': next_row[1] or next_row[2]} if next_row else None,
        }
        return {
            'statusCode': 200,
            'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
            'body': json.dumps({'ok': True, 'item': item})
        }

    # Список новостей
    category = params.get('category', '')
    search = params.get('search', '')
    limit = min(int(params.get('limit', 40)), 100)
    offset = int(params.get('offset', 0))

    where_clauses = []
    args = []

    if category and category != 'Все':
        where_clauses.append("n.category = %s")
        args.append(category)

    if search:
        where_clauses.append(
            "(n.title_ru ILIKE %s OR n.title ILIKE %s OR n.excerpt_ru ILIKE %s OR n.excerpt ILIKE %s)"
        )
        args.extend([f'%{search}%'] * 4)

    where_sql = ('WHERE ' + ' AND '.join(where_clauses)) if where_clauses else ''

    cur.execute(
        f"""SELECT n.id, n.title, n.title_ru, n.excerpt, n.excerpt_ru,
                   n.url, n.image_url, n.category, n.published_at,
                   n.translated, s.name as source_name
            FROM {schema}.news_items n
            LEFT JOIN {schema}.rss_sources s ON s.id = n.source_id
            {where_sql}
            ORDER BY n.published_at DESC NULLS LAST
            LIMIT %s OFFSET %s""",
        args + [limit, offset]
    )
    rows = cur.fetchall()

    cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items n {where_sql}", args)
    total = cur.fetchone()[0]

    cur.execute(
        f"SELECT DISTINCT category FROM {schema}.news_items WHERE category IS NOT NULL ORDER BY category"
    )
    categories = [r[0] for r in cur.fetchall()]

    cur.close()
    conn.close()

    items = []
    for row in rows:
        pub = row[8]
        items.append({
            'id': row[0],
            'title': row[2] or row[1],         # title_ru если есть
            'title_original': row[1],
            'excerpt': row[4] or row[3] or '',  # excerpt_ru если есть
            'url': row[5],
            'image': row[6] or '',
            'category': row[7] or 'Общее',
            'time': time_ago(pub),
            'published_at': serialize(pub),
            'translated': row[9] or False,
            'source': row[10] or '',
        })

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({'ok': True, 'items': items, 'total': total, 'categories': categories})
    }

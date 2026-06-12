import os
import json
import psycopg2
from datetime import datetime, timezone


def serialize(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    return str(obj)


def handler(event: dict, context) -> dict:
    """Возвращает список новостей с фильтрацией по категории, тегу и поиску."""
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
    category = params.get('category', '')
    search = params.get('search', '')
    limit = min(int(params.get('limit', 40)), 100)
    offset = int(params.get('offset', 0))

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    where_clauses = []
    args = []

    if category and category != 'Все':
        where_clauses.append("n.category = %s")
        args.append(category)

    if search:
        where_clauses.append("(n.title ILIKE %s OR n.excerpt ILIKE %s)")
        args.extend([f'%{search}%', f'%{search}%'])

    where_sql = ('WHERE ' + ' AND '.join(where_clauses)) if where_clauses else ''

    cur.execute(
        f"""SELECT n.id, n.title, n.excerpt, n.url, n.image_url, n.category,
                   n.published_at, s.name as source_name
            FROM {schema}.news_items n
            LEFT JOIN {schema}.rss_sources s ON s.id = n.source_id
            {where_sql}
            ORDER BY n.published_at DESC NULLS LAST
            LIMIT %s OFFSET %s""",
        args + [limit, offset]
    )
    rows = cur.fetchall()

    cur.execute(
        f"SELECT COUNT(*) FROM {schema}.news_items n {where_sql}",
        args
    )
    total = cur.fetchone()[0]

    cur.execute(
        f"SELECT DISTINCT category FROM {schema}.news_items WHERE category IS NOT NULL ORDER BY category"
    )
    categories = [r[0] for r in cur.fetchall()]

    cur.close()
    conn.close()

    items = []
    for row in rows:
        pub = row[6]
        if pub:
            now = datetime.now(timezone.utc)
            if pub.tzinfo is None:
                pub = pub.replace(tzinfo=timezone.utc)
            diff = now - pub
            if diff.days == 0:
                h = diff.seconds // 3600
                time_ago = f"{h} {'час' if h == 1 else 'часов'} назад" if h > 0 else "только что"
            elif diff.days == 1:
                time_ago = "1 день назад"
            else:
                time_ago = f"{diff.days} дней назад"
        else:
            time_ago = ""

        items.append({
            'id': row[0],
            'title': row[1],
            'excerpt': row[2] or '',
            'url': row[3],
            'image': row[4] or '',
            'category': row[5] or 'Общее',
            'time': time_ago,
            'published_at': serialize(row[6]),
            'source': row[7] or '',
        })

    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
        'body': json.dumps({'ok': True, 'items': items, 'total': total, 'categories': categories})
    }

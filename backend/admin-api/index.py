import os
import json
import psycopg2


ADMIN_TOKEN = os.environ.get('ADMIN_TOKEN', 'gamefeed-admin-2025')


def check_auth(event: dict) -> bool:
    headers = event.get('headers') or {}
    token = headers.get('X-Admin-Token') or headers.get('x-admin-token', '')
    return token == ADMIN_TOKEN


def handler(event: dict, context) -> dict:
    """Управление RSS-источниками: CRUD операции для админ-панели."""
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
            },
            'body': ''
        }

    if not check_auth(event):
        return {
            'statusCode': 401,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'ok': False, 'error': 'Unauthorized'})
        }

    schema = os.environ['MAIN_DB_SCHEMA']
    method = event.get('httpMethod', 'GET')
    params = event.get('queryStringParameters') or {}
    action = params.get('action', '')

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor()

    try:
        # GET /  — список источников + статистика
        if method == 'GET' and not action:
            cur.execute(
                f"""SELECT s.id, s.name, s.url, s.category, s.active, s.last_fetched_at,
                           COUNT(n.id) as news_count
                    FROM {schema}.rss_sources s
                    LEFT JOIN {schema}.news_items n ON n.source_id = s.id
                    GROUP BY s.id
                    ORDER BY s.id"""
            )
            rows = cur.fetchall()
            sources = []
            for r in rows:
                sources.append({
                    'id': r[0], 'name': r[1], 'url': r[2], 'category': r[3],
                    'active': r[4],
                    'last_fetched_at': r[5].isoformat() if r[5] else None,
                    'news_count': r[6]
                })

            cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items")
            total_news = cur.fetchone()[0]

            cur.execute(f"SELECT COUNT(*) FROM {schema}.rss_sources WHERE active = true")
            active_sources = cur.fetchone()[0]

            conn.close()
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({
                    'ok': True,
                    'sources': sources,
                    'stats': {'total_news': total_news, 'active_sources': active_sources}
                })
            }

        # POST / — добавить источник
        if method == 'POST':
            body = json.loads(event.get('body') or '{}')
            name = body.get('name', '').strip()
            url = body.get('url', '').strip()
            category = body.get('category', 'Общее').strip()
            if not name or not url:
                conn.close()
                return {
                    'statusCode': 400,
                    'headers': {'Access-Control-Allow-Origin': '*'},
                    'body': json.dumps({'ok': False, 'error': 'name and url required'})
                }
            cur.execute(
                f"INSERT INTO {schema}.rss_sources (name, url, category, active) VALUES (%s, %s, %s, true) RETURNING id",
                (name, url, category)
            )
            new_id = cur.fetchone()[0]
            conn.commit()
            conn.close()
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({'ok': True, 'id': new_id})
            }

        # PUT /?action=toggle&id=X — включить/выключить источник
        if method == 'PUT' and action == 'toggle':
            src_id = params.get('id')
            cur.execute(
                f"UPDATE {schema}.rss_sources SET active = NOT active WHERE id = %s RETURNING active",
                (src_id,)
            )
            row = cur.fetchone()
            conn.commit()
            conn.close()
            return {
                'statusCode': 200,
                'headers': {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'},
                'body': json.dumps({'ok': True, 'active': row[0] if row else None})
            }

        conn.close()
        return {
            'statusCode': 404,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'ok': False, 'error': 'Not found'})
        }

    except Exception as e:
        conn.rollback()
        conn.close()
        return {
            'statusCode': 500,
            'headers': {'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'ok': False, 'error': str(e)})
        }

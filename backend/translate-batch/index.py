import os
import json
import psycopg2
import urllib.request


def translate_batch(items: list, api_key: str) -> list:
    """
    Переводит батч статей через OpenAI gpt-4o-mini.
    items: [{'id': int, 'title': str, 'excerpt': str}, ...]
    Возвращает [{'id': int, 'title_ru': str, 'excerpt_ru': str}, ...]
    """
    texts = []
    for item in items:
        texts.append(
            f"[{item['id']}] TITLE: {item['title']}\n"
            f"EXCERPT: {(item['excerpt'] or '')[:400]}"
        )

    prompt = (
        "Переведи на современный читабельный русский язык следующие игровые новости. "
        "Перевод должен быть живым, естественным, без дословной кальки. "
        "Игровые термины (названия игр, жанры, механики) оставляй как есть. "
        "Для каждой новости верни объект с полями: id (число из квадратных скобок), title_ru, excerpt_ru. "
        'Ответ строго в формате JSON: {"translations": [{...}, ...]}\n\n'
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
    with urllib.request.urlopen(req, timeout=50) as resp:
        data = json.loads(resp.read())

    content = data["choices"][0]["message"]["content"]
    parsed = json.loads(content)

    # Нормализуем
    translations = parsed if isinstance(parsed, list) else parsed.get("translations", [])

    # Строим карту id → перевод
    result_map = {}
    for t in translations:
        tid = t.get("id")
        if tid is not None:
            result_map[int(tid)] = {
                "title_ru": t.get("title_ru", ""),
                "excerpt_ru": t.get("excerpt_ru", ""),
            }

    # Для тех, кто не попал в ответ — фоллбэк на оригинал
    results = []
    for item in items:
        if item["id"] in result_map:
            results.append({
                "id": item["id"],
                "title_ru": result_map[item["id"]]["title_ru"] or item["title"],
                "excerpt_ru": result_map[item["id"]]["excerpt_ru"] or item["excerpt"],
            })
        else:
            results.append({
                "id": item["id"],
                "title_ru": item["title"],
                "excerpt_ru": item["excerpt"],
            })
    return results


def handler(event: dict, context) -> dict:
    """
    Переводит существующие непереведённые статьи из БД батчами по 10.
    GET /              — переводит следующие 10 непереведённых
    GET /?batch=20     — переводит следующие N (макс 20) непереведённых
    GET /?stats=1      — только статистика, без перевода
    """
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": "",
        }

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"ok": False, "error": "OPENAI_API_KEY not set"}),
        }

    params = event.get("queryStringParameters") or {}
    stats_only = params.get("stats") == "1"
    batch_size = min(int(params.get("batch", 10)), 20)

    schema = os.environ["MAIN_DB_SCHEMA"]
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # Статистика
    cur.execute(
        f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = false OR translated IS NULL"
    )
    remaining = cur.fetchone()[0]

    cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = true")
    done = cur.fetchone()[0]

    if stats_only or remaining == 0:
        cur.close()
        conn.close()
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps({
                "ok": True,
                "translated": done,
                "remaining": remaining,
                "finished": remaining == 0,
            }),
        }

    # Берём следующий батч
    cur.execute(
        f"""SELECT id, title, excerpt FROM {schema}.news_items
            WHERE translated = false OR translated IS NULL
            ORDER BY id ASC
            LIMIT %s""",
        (batch_size,)
    )
    rows = cur.fetchall()
    items = [{"id": r[0], "title": r[1], "excerpt": r[2] or ""} for r in rows]

    translated_count = 0
    error_msg = None

    try:
        results = translate_batch(items, api_key)
        for res in results:
            cur.execute(
                f"""UPDATE {schema}.news_items
                    SET title_ru = %s, excerpt_ru = %s, translated = true
                    WHERE id = %s""",
                (res["title_ru"], res["excerpt_ru"], res["id"])
            )
            translated_count += 1
        conn.commit()
    except Exception as e:
        conn.rollback()
        error_msg = str(e)[:300]

    cur.close()
    conn.close()

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
        "body": json.dumps({
            "ok": error_msg is None,
            "translated_now": translated_count,
            "remaining": max(0, remaining - translated_count),
            "finished": (remaining - translated_count) <= 0,
            "error": error_msg,
        }),
    }

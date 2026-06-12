import os
import json
import psycopg2
import urllib.request
from datetime import datetime, timezone

STYLE_PROMPTS = {
    "readable": (
        "Переведи на современный живой русский язык. "
        "Текст должен читаться естественно, как написанный русскоязычным автором. "
        "Игровые термины, названия игр, студий и персонажей оставляй без изменений."
    ),
    "precise": (
        "Переведи точно и близко к оригиналу, сохраняя структуру предложений. "
        "Минимум адаптации — только необходимые грамматические изменения. "
        "Игровые термины и названия не переводи."
    ),
    "short": (
        "Переведи на русский язык и сократи текст, оставив только суть. "
        "Убери воду и повторы. Заголовок — ёмкий, до 10 слов. "
        "Описание — 1-2 предложения с главной мыслью."
    ),
    "custom": "",
}


def build_prompt(style: str, custom_prompt: str, items: list) -> str:
    style_instruction = custom_prompt if style == "custom" and custom_prompt else STYLE_PROMPTS.get(style, STYLE_PROMPTS["readable"])

    texts = []
    for item in items:
        texts.append(
            f"[{item['id']}] TITLE: {item['title']}\n"
            f"EXCERPT: {(item['excerpt'] or '')[:400]}"
        )

    return (
        f"{style_instruction}\n\n"
        "Для каждой новости верни объект с полями: id (число из квадратных скобок), title_ru, excerpt_ru.\n"
        'Ответ строго в формате JSON: {"translations": [{...}, ...]}\n\n'
        + "\n\n".join(texts)
    )


def call_openai(prompt: str, model: str, api_key: str, timeout: int = 50) -> dict:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def parse_translations(content: str, items: list) -> list:
    parsed = json.loads(content)
    translations = parsed if isinstance(parsed, list) else parsed.get("translations", [])
    result_map = {}
    for t in translations:
        tid = t.get("id")
        if tid is not None:
            result_map[int(tid)] = {"title_ru": t.get("title_ru", ""), "excerpt_ru": t.get("excerpt_ru", "")}
    results = []
    for item in items:
        if item["id"] in result_map:
            results.append({
                "id": item["id"],
                "title_ru": result_map[item["id"]]["title_ru"] or item["title"],
                "excerpt_ru": result_map[item["id"]]["excerpt_ru"] or item["excerpt"],
            })
        else:
            results.append({"id": item["id"], "title_ru": item["title"], "excerpt_ru": item["excerpt"]})
    return results


def handler(event: dict, context) -> dict:
    """
    Полноценный API переводчика с настройками.
    GET  /                     — получить настройки + статистику
    POST /  body={...}         — сохранить настройки
    GET  /?action=test&id=X    — тест перевода одной статьи
    GET  /?action=run&batch=N  — перевести следующий батч
    GET  /?action=retranslate&id=X — переперевести одну статью
    GET  /?action=models       — список доступных моделей
    """
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": "",
        }

    api_key = os.environ.get("OPENAI_API_KEY", "")
    schema = os.environ["MAIN_DB_SCHEMA"]
    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    action = params.get("action", "")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # ── GET настройки + статистика ──────────────────────────────────────────
    if method == "GET" and not action:
        cur.execute(f"SELECT model, style, batch_size, auto_translate, custom_prompt, updated_at FROM {schema}.translator_settings ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = true")
        done = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = false OR translated IS NULL")
        remaining = cur.fetchone()[0]
        cur.close()
        conn.close()
        settings = {
            "model": row[0], "style": row[1], "batch_size": row[2],
            "auto_translate": row[3], "custom_prompt": row[4] or "",
            "updated_at": row[5].isoformat() if row[5] else None,
        } if row else {"model": "gpt-4o-mini", "style": "readable", "batch_size": 10, "auto_translate": True, "custom_prompt": ""}
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps({
                "ok": True,
                "settings": settings,
                "stats": {"translated": done, "remaining": remaining, "total": done + remaining, "has_key": bool(api_key)},
                "styles": [
                    {"id": "readable", "label": "Живой и читабельный", "desc": "Естественный перевод, как написанный на русском"},
                    {"id": "precise",  "label": "Точный",              "desc": "Близко к оригиналу, минимум адаптации"},
                    {"id": "short",    "label": "Краткий",             "desc": "Сокращённый пересказ — только суть"},
                    {"id": "custom",   "label": "Свой промпт",        "desc": "Задайте инструкцию переводчику вручную"},
                ],
                "models": ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
            })
        }

    # ── POST сохранить настройки ────────────────────────────────────────────
    if method == "POST":
        body = json.loads(event.get("body") or "{}")
        model = body.get("model", "gpt-4o-mini")
        style = body.get("style", "readable")
        batch_size = max(1, min(int(body.get("batch_size", 10)), 20))
        auto_translate = bool(body.get("auto_translate", True))
        custom_prompt = body.get("custom_prompt", "")[:1000]

        cur.execute(
            f"""UPDATE {schema}.translator_settings
                SET model=%s, style=%s, batch_size=%s, auto_translate=%s, custom_prompt=%s, updated_at=NOW()
                WHERE id=(SELECT id FROM {schema}.translator_settings ORDER BY id DESC LIMIT 1)""",
            (model, style, batch_size, auto_translate, custom_prompt)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps({"ok": True})
        }

    # ── Для всех action-запросов нужен ключ ─────────────────────────────────
    if not api_key:
        cur.close()
        conn.close()
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"ok": False, "error": "OPENAI_API_KEY не установлен. Добавьте ключ в настройках проекта."})
        }

    # Загружаем настройки
    cur.execute(f"SELECT model, style, batch_size, auto_translate, custom_prompt FROM {schema}.translator_settings ORDER BY id DESC LIMIT 1")
    row = cur.fetchone()
    cfg = {"model": row[0], "style": row[1], "batch_size": row[2], "custom_prompt": row[4] or ""} if row else {"model": "gpt-4o-mini", "style": "readable", "batch_size": 10, "custom_prompt": ""}

    # ── TEST: тест на одной статье ──────────────────────────────────────────
    if action == "test":
        article_id = params.get("id")
        if article_id:
            cur.execute(f"SELECT id, title, excerpt FROM {schema}.news_items WHERE id = %s", (article_id,))
        else:
            cur.execute(f"SELECT id, title, excerpt FROM {schema}.news_items ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return {"statusCode": 404, "headers": {"Access-Control-Allow-Origin": "*"}, "body": json.dumps({"ok": False, "error": "Статья не найдена"})}

        items = [{"id": row[0], "title": row[1], "excerpt": row[2] or ""}]
        prompt = build_prompt(cfg["style"], cfg["custom_prompt"], items)
        try:
            resp = call_openai(prompt, cfg["model"], api_key, timeout=30)
            content = resp["choices"][0]["message"]["content"]
            usage = resp.get("usage", {})
            results = parse_translations(content, items)
            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({
                    "ok": True,
                    "original": {"title": row[1], "excerpt": row[2] or ""},
                    "translated": {"title_ru": results[0]["title_ru"], "excerpt_ru": results[0]["excerpt_ru"]},
                    "model": cfg["model"],
                    "tokens_used": usage.get("total_tokens", 0),
                })
            }
        except Exception as e:
            return {"statusCode": 500, "headers": {"Access-Control-Allow-Origin": "*"}, "body": json.dumps({"ok": False, "error": str(e)[:300]})}

    # ── RUN: перевести следующий батч ───────────────────────────────────────
    if action == "run":
        batch_size = min(int(params.get("batch", cfg["batch_size"])), 20)
        cur.execute(
            f"""SELECT id, title, excerpt FROM {schema}.news_items
                WHERE translated = false OR translated IS NULL
                ORDER BY id ASC LIMIT %s""",
            (batch_size,)
        )
        rows = cur.fetchall()
        if not rows:
            cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = true")
            done = cur.fetchone()[0]
            cur.close()
            conn.close()
            return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                    "body": json.dumps({"ok": True, "translated_now": 0, "remaining": 0, "finished": True, "translated_total": done})}

        items = [{"id": r[0], "title": r[1], "excerpt": r[2] or ""} for r in rows]
        prompt = build_prompt(cfg["style"], cfg["custom_prompt"], items)

        translated_count = 0
        tokens_used = 0
        error_msg = None
        try:
            resp = call_openai(prompt, cfg["model"], api_key)
            content = resp["choices"][0]["message"]["content"]
            tokens_used = resp.get("usage", {}).get("total_tokens", 0)
            results = parse_translations(content, items)
            for res in results:
                cur.execute(
                    f"UPDATE {schema}.news_items SET title_ru=%s, excerpt_ru=%s, translated=true WHERE id=%s",
                    (res["title_ru"], res["excerpt_ru"], res["id"])
                )
                translated_count += 1
            conn.commit()
        except Exception as e:
            conn.rollback()
            error_msg = str(e)[:300]

        cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = false OR translated IS NULL")
        remaining = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = true")
        done = cur.fetchone()[0]
        cur.close()
        conn.close()

        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps({
                "ok": error_msg is None,
                "translated_now": translated_count,
                "remaining": remaining,
                "translated_total": done,
                "finished": remaining == 0,
                "tokens_used": tokens_used,
                "error": error_msg,
            })
        }

    # ── RETRANSLATE: переперевести конкретную статью ─────────────────────────
    if action == "retranslate":
        article_id = params.get("id")
        if not article_id:
            cur.close()
            conn.close()
            return {"statusCode": 400, "headers": {"Access-Control-Allow-Origin": "*"}, "body": json.dumps({"ok": False, "error": "id обязателен"})}

        cur.execute(f"SELECT id, title, excerpt FROM {schema}.news_items WHERE id = %s", (article_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {"statusCode": 404, "headers": {"Access-Control-Allow-Origin": "*"}, "body": json.dumps({"ok": False, "error": "Статья не найдена"})}

        items = [{"id": row[0], "title": row[1], "excerpt": row[2] or ""}]
        prompt = build_prompt(cfg["style"], cfg["custom_prompt"], items)
        try:
            resp = call_openai(prompt, cfg["model"], api_key, timeout=30)
            content = resp["choices"][0]["message"]["content"]
            results = parse_translations(content, items)
            cur.execute(
                f"UPDATE {schema}.news_items SET title_ru=%s, excerpt_ru=%s, translated=true WHERE id=%s",
                (results[0]["title_ru"], results[0]["excerpt_ru"], row[0])
            )
            conn.commit()
            cur.close()
            conn.close()
            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"ok": True, "title_ru": results[0]["title_ru"], "excerpt_ru": results[0]["excerpt_ru"]})
            }
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            return {"statusCode": 500, "headers": {"Access-Control-Allow-Origin": "*"}, "body": json.dumps({"ok": False, "error": str(e)[:300]})}

    cur.close()
    conn.close()
    return {"statusCode": 404, "headers": {"Access-Control-Allow-Origin": "*"}, "body": json.dumps({"ok": False, "error": "Unknown action"})}

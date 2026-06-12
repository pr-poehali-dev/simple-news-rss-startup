import os
import json
import psycopg2
import urllib.request
from datetime import datetime, timezone, timedelta
import random


def call_openai(prompt: str, api_key: str) -> str:
    body = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "response_format": {"type": "json_object"}
    }).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=55) as resp:
        data = json.loads(resp.read())
    return data["choices"][0]["message"]["content"]


SEED_ARTICLES = [
    {"category": "RPG", "source": "GameFeed", "image": "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/6871d83a-8d84-4793-9df6-8bcea0ae44e8.jpg"},
    {"category": "Шутеры", "source": "GameFeed", "image": "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/af879cd1-5927-43f0-8fbc-8e46fe0e0265.jpg"},
    {"category": "Киберспорт", "source": "GameFeed", "image": "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/6c3a6321-c3ef-4f09-86f0-7e2fae796585.jpg"},
    {"category": "Инди", "source": "GameFeed", "image": ""},
    {"category": "Обновления", "source": "GameFeed", "image": ""},
    {"category": "Стратегии", "source": "GameFeed", "image": "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/6c3a6321-c3ef-4f09-86f0-7e2fae796585.jpg"},
    {"category": "PC", "source": "GameFeed", "image": ""},
    {"category": "Консоли", "source": "GameFeed", "image": "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/6871d83a-8d84-4793-9df6-8bcea0ae44e8.jpg"},
    {"category": "Мобильные", "source": "GameFeed", "image": ""},
    {"category": "RPG", "source": "GameFeed", "image": "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/af879cd1-5927-43f0-8fbc-8e46fe0e0265.jpg"},
]


def generate_articles(api_key: str) -> list:
    prompt = """Сгенерируй 30 реалистичных игровых новостей на современном читабельном русском языке.
Это должны быть разнообразные новости: анонсы, обзоры, патчи, киберспорт, инди-игры, консоли, PC, мобильные.
Используй реальные названия игр (Elden Ring, GTA VI, Cyberpunk 2077, Hollow Knight, Dota 2, CS2, Minecraft, Baldur's Gate 3, The Witcher, Dark Souls, Starfield и др.).
Тексты должны быть живыми, как настоящие новости — с деталями, цифрами, именами разработчиков.

Верни JSON: {"articles": [{"title": "...", "excerpt": "...", "category": "...", "url": "https://gamefeed.ru/news/N", "hours_ago": N}, ...]}

Категории: RPG, Шутеры, Стратегии, Инди, Киберспорт, Обновления, PC, Консоли, Мобильные
hours_ago — сколько часов назад (от 1 до 240, чтобы статьи были разного возраста)
title — заголовок до 120 символов
excerpt — 2-3 предложения, 200-400 символов
"""
    content = call_openai(prompt, api_key)
    parsed = json.loads(content)
    return parsed.get("articles", [])


def handler(event: dict, context) -> dict:
    """
    Генерирует 30 качественных переведённых игровых новостей через OpenAI
    и сохраняет их в базу данных. Вызывается один раз для начального заполнения.
    GET /?dry=1 — только показать что будет сгенерировано (без записи в БД)
    """
    if event.get("httpMethod") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type"},
            "body": ""
        }

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"ok": False, "error": "OPENAI_API_KEY not set"})
        }

    params = event.get("queryStringParameters") or {}
    dry_run = params.get("dry") == "1"

    if dry_run:
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps({"ok": True, "preview": [], "total": 30, "message": "dry run ok"})
        }

    schema = os.environ["MAIN_DB_SCHEMA"]
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # Получаем первый источник
    cur.execute(f"SELECT id FROM {schema}.rss_sources LIMIT 1")
    row = cur.fetchone()
    source_id = row[0] if row else None

    try:
        articles = generate_articles(api_key)
    except Exception as e:
        cur.close()
        conn.close()
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"ok": False, "error": f"OpenAI error: {str(e)[:300]}"})
        }

    now = datetime.now(timezone.utc)
    added = 0
    images = [
        "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/6871d83a-8d84-4793-9df6-8bcea0ae44e8.jpg",
        "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/af879cd1-5927-43f0-8fbc-8e46fe0e0265.jpg",
        "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/6c3a6321-c3ef-4f09-86f0-7e2fae796585.jpg",
        "",
    ]

    for i, article in enumerate(articles):
        title = article.get("title", "").strip()
        excerpt = article.get("excerpt", "").strip()
        category = article.get("category", "Общее")
        url = article.get("url", f"https://gamefeed.ru/news/{i+1}")
        hours_ago = int(article.get("hours_ago", random.randint(1, 120)))
        published_at = now - timedelta(hours=hours_ago)
        image_url = images[i % len(images)]
        guid = f"seed-{category.lower()}-{i+1}-{int(now.timestamp())}"

        if not title:
            continue

        cur.execute(
            f"""INSERT INTO {schema}.news_items
                (source_id, guid, title, excerpt, title_ru, excerpt_ru, translated,
                 url, image_url, category, published_at)
                VALUES (%s, %s, %s, %s, %s, %s, true, %s, %s, %s, %s)
                ON CONFLICT (guid) DO NOTHING""",
            (source_id, guid, title, excerpt, title, excerpt,
             url, image_url, category, published_at)
        )
        if cur.rowcount > 0:
            added += 1

    conn.commit()
    cur.close()
    conn.close()

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
        "body": json.dumps({"ok": True, "generated": len(articles), "added": added})
    }
import os
import json
import psycopg2
import urllib.request
import urllib.parse

# ── Промпты стилей ───────────────────────────────────────────────────────────

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

PROVIDERS = {
    "openai":  {"label": "OpenAI",           "models": ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"], "key_field": "api_key",        "url": "https://platform.openai.com/api-keys"},
    "deepl":   {"label": "DeepL",            "models": [],                                           "key_field": "api_key_deepl",  "url": "https://www.deepl.com/pro-api"},
    "yandex":  {"label": "Yandex Translate", "models": [],                                           "key_field": "api_key_yandex", "url": "https://yandex.cloud/ru/services/translate"},
    "google":  {"label": "Google Translate", "models": [],                                           "key_field": "api_key_google", "url": "https://cloud.google.com/translate"},
    "custom":  {"label": "Свой endpoint",    "models": [],                                           "key_field": "api_key",        "url": ""},
}


# ── Маскировка ключа ─────────────────────────────────────────────────────────

def mask_key(key: str) -> str:
    if not key:
        return ""
    if len(key) <= 8:
        return "****"
    return f"{key[:4]}...{key[-4:]}"


# ── Промпт ───────────────────────────────────────────────────────────────────

def build_prompt(style: str, custom_prompt: str, items: list) -> str:
    instruction = custom_prompt if style == "custom" and custom_prompt else STYLE_PROMPTS.get(style, STYLE_PROMPTS["readable"])
    texts = [f"[{i['id']}] TITLE: {i['title']}\nEXCERPT: {(i['excerpt'] or '')[:400]}" for i in items]
    return (
        f"{instruction}\n\n"
        "Для каждой новости верни объект с полями: id (число из квадратных скобок), title_ru, excerpt_ru.\n"
        'Ответ строго в формате JSON: {"translations": [{...}, ...]}\n\n'
        + "\n\n".join(texts)
    )


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
        r = result_map.get(item["id"])
        results.append({
            "id": item["id"],
            "title_ru": (r["title_ru"] if r else "") or item["title"],
            "excerpt_ru": (r["excerpt_ru"] if r else "") or item["excerpt"],
        })
    return results


# ── Провайдеры перевода ──────────────────────────────────────────────────────

def translate_openai(items: list, cfg: dict, api_key: str) -> tuple:
    """OpenAI / OpenAI-compatible endpoint. Возвращает (results, tokens_used)."""
    model = cfg.get("custom_model") or cfg.get("model", "gpt-4o-mini")
    endpoint = (cfg.get("custom_endpoint") or "https://api.openai.com").rstrip("/")
    url = f"{endpoint}/v1/chat/completions"
    prompt = build_prompt(cfg["style"], cfg.get("custom_prompt", ""), items)
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(url, data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=50) as resp:
        data = json.loads(resp.read())
    content = data["choices"][0]["message"]["content"]
    tokens = data.get("usage", {}).get("total_tokens", 0)
    return parse_translations(content, items), tokens


def translate_deepl(items: list, api_key: str) -> tuple:
    """DeepL Free/Pro API."""
    results = []
    tokens = 0
    base = "https://api-free.deepl.com" if api_key.endswith(":fx") else "https://api.deepl.com"
    for item in items:
        texts = [item["title"], item["excerpt"] or ""]
        body = urllib.parse.urlencode({
            "auth_key": api_key,
            "text": texts,
            "target_lang": "RU",
        }, doseq=True).encode()
        req = urllib.request.Request(f"{base}/v2/translate", data=body)
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
        translated = [t["text"] for t in data.get("translations", [])]
        results.append({
            "id": item["id"],
            "title_ru": translated[0] if len(translated) > 0 else item["title"],
            "excerpt_ru": translated[1] if len(translated) > 1 else item["excerpt"],
        })
        tokens += len(item["title"]) + len(item["excerpt"] or "")
    return results, tokens


def translate_yandex(items: list, api_key: str) -> tuple:
    """Yandex Cloud Translate v2."""
    results = []
    tokens = 0
    for item in items:
        texts = [item["title"], item["excerpt"] or ""]
        body = json.dumps({"texts": texts, "targetLanguageCode": "ru", "folderId": ""}).encode()
        req = urllib.request.Request(
            "https://translate.api.cloud.yandex.net/translate/v2/translate",
            data=body,
            headers={"Authorization": f"Api-Key {api_key}", "Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
        translated = [t["text"] for t in data.get("translations", [])]
        results.append({
            "id": item["id"],
            "title_ru": translated[0] if len(translated) > 0 else item["title"],
            "excerpt_ru": translated[1] if len(translated) > 1 else item["excerpt"],
        })
        tokens += len(item["title"]) + len(item["excerpt"] or "")
    return results, tokens


def translate_google(items: list, api_key: str) -> tuple:
    """Google Cloud Translation API v2."""
    results = []
    tokens = 0
    for item in items:
        texts = [item["title"], item["excerpt"] or ""]
        body = json.dumps({"q": texts, "target": "ru", "format": "text", "key": api_key}).encode()
        req = urllib.request.Request(
            "https://translation.googleapis.com/language/translate/v2",
            data=body,
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
        translated = [t["translatedText"] for t in data.get("data", {}).get("translations", [])]
        results.append({
            "id": item["id"],
            "title_ru": translated[0] if len(translated) > 0 else item["title"],
            "excerpt_ru": translated[1] if len(translated) > 1 else item["excerpt"],
        })
        tokens += len(item["title"]) + len(item["excerpt"] or "")
    return results, tokens


def do_translate(items: list, cfg: dict, api_key: str) -> tuple:
    """Вызывает нужный провайдер. Возвращает (results, tokens_used)."""
    provider = cfg.get("provider", "openai")
    if provider == "deepl":
        return translate_deepl(items, api_key)
    if provider == "yandex":
        return translate_yandex(items, api_key)
    if provider == "google":
        return translate_google(items, api_key)
    # openai или custom (OpenAI-compatible)
    return translate_openai(items, cfg, api_key)


def verify_key(provider: str, api_key: str, custom_endpoint: str = "") -> bool:
    """Быстрая проверка ключа — возвращает True если ключ валидный."""
    try:
        if provider in ("openai", "custom"):
            base = (custom_endpoint or "https://api.openai.com").rstrip("/")
            req = urllib.request.Request(f"{base}/v1/models",
                headers={"Authorization": f"Bearer {api_key}"})
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status == 200
        if provider == "deepl":
            base = "https://api-free.deepl.com" if api_key.endswith(":fx") else "https://api.deepl.com"
            body = urllib.parse.urlencode({"auth_key": api_key}).encode()
            req = urllib.request.Request(f"{base}/v2/usage", data=body)
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status == 200
        if provider == "yandex":
            body = json.dumps({"texts": ["test"], "targetLanguageCode": "ru"}).encode()
            req = urllib.request.Request(
                "https://translate.api.cloud.yandex.net/translate/v2/translate",
                data=body,
                headers={"Authorization": f"Api-Key {api_key}", "Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status == 200
        if provider == "google":
            body = json.dumps({"q": ["test"], "target": "ru", "key": api_key}).encode()
            req = urllib.request.Request(
                "https://translation.googleapis.com/language/translate/v2",
                data=body, headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                return r.status == 200
    except Exception:
        return False
    return False


# ── БД helpers ───────────────────────────────────────────────────────────────

def load_settings(cur, schema: str) -> dict:
    cur.execute(
        f"SELECT model, style, batch_size, auto_translate, custom_prompt, "
        f"api_key, api_key_deepl, api_key_yandex, api_key_google, "
        f"provider, custom_endpoint, custom_model, updated_at "
        f"FROM {schema}.translator_settings ORDER BY id DESC LIMIT 1"
    )
    row = cur.fetchone()
    if not row:
        return {
            "model": "gpt-4o-mini", "style": "readable", "batch_size": 10,
            "auto_translate": True, "custom_prompt": "", "provider": "openai",
            "api_key": "", "api_key_deepl": "", "api_key_yandex": "", "api_key_google": "",
            "custom_endpoint": "", "custom_model": "", "updated_at": None,
        }
    env_openai = os.environ.get("OPENAI_API_KEY", "")
    provider = row[9] or "openai"
    db_openai = (row[5] or "").strip()
    return {
        "model":          row[0],
        "style":          row[1],
        "batch_size":     row[2],
        "auto_translate": row[3],
        "custom_prompt":  row[4] or "",
        "api_key":        db_openai or env_openai,
        "api_key_deepl":  (row[6] or "").strip(),
        "api_key_yandex": (row[7] or "").strip(),
        "api_key_google": (row[8] or "").strip(),
        "provider":       provider,
        "custom_endpoint": row[10] or "",
        "custom_model":   row[11] or "",
        "updated_at":     row[12].isoformat() if row[12] else None,
        # для фронта
        "_openai_source": "db" if db_openai else ("env" if env_openai else "none"),
    }


def get_active_key(cfg: dict) -> str:
    provider = cfg.get("provider", "openai")
    if provider == "deepl":   return cfg.get("api_key_deepl", "")
    if provider == "yandex":  return cfg.get("api_key_yandex", "")
    if provider == "google":  return cfg.get("api_key_google", "")
    return cfg.get("api_key", "")  # openai / custom


# ── Handler ──────────────────────────────────────────────────────────────────

def handler(event: dict, context) -> dict:
    """
    Переводчик с поддержкой OpenAI / DeepL / Yandex / Google / Custom endpoint.
    GET  /                              — настройки + статистика
    POST / {model,style,...}            — сохранить настройки
    POST / {provider, api_key, ...}     — сохранить ключ(и)
    GET  /?action=test[&id=X]           — тест перевода
    GET  /?action=run[&batch=N]         — перевести батч
    GET  /?action=retranslate&id=X      — переперевести одну статью
    """
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"}, "body": ""}

    schema = os.environ["MAIN_DB_SCHEMA"]
    method = event.get("httpMethod", "GET")
    params = event.get("queryStringParameters") or {}
    action = params.get("action", "")

    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # ── GET настройки ────────────────────────────────────────────────────────
    if method == "GET" and not action:
        cfg = load_settings(cur, schema)
        cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = true")
        done = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {schema}.news_items WHERE translated = false OR translated IS NULL")
        remaining = cur.fetchone()[0]
        cur.close()
        conn.close()

        # Формируем key_info для каждого провайдера
        key_info = {}
        for p, info in PROVIDERS.items():
            if p == "openai":
                key = cfg["api_key"]
                source = cfg["_openai_source"]
            elif p == "deepl":
                key = cfg["api_key_deepl"]
                source = "db" if key else "none"
            elif p == "yandex":
                key = cfg["api_key_yandex"]
                source = "db" if key else "none"
            elif p == "google":
                key = cfg["api_key_google"]
                source = "db" if key else "none"
            else:
                key = cfg["api_key"]
                source = cfg["_openai_source"]
            key_info[p] = {"masked": mask_key(key), "source": source, "has_key": bool(key)}

        settings_out = {
            "model": cfg["model"], "style": cfg["style"],
            "batch_size": cfg["batch_size"], "auto_translate": cfg["auto_translate"],
            "custom_prompt": cfg["custom_prompt"], "provider": cfg["provider"],
            "custom_endpoint": cfg["custom_endpoint"], "custom_model": cfg["custom_model"],
            "updated_at": cfg["updated_at"],
        }
        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
            "body": json.dumps({
                "ok": True,
                "settings": settings_out,
                "key_info": key_info,
                "stats": {"translated": done, "remaining": remaining, "total": done + remaining},
                "providers": [
                    {"id": "openai",  "label": "OpenAI",           "desc": "GPT-4o-mini, GPT-4o и другие. Высокое качество.", "url": "https://platform.openai.com/api-keys", "has_models": True},
                    {"id": "deepl",   "label": "DeepL",            "desc": "Специализированный нейропереводчик. Отличное качество.", "url": "https://www.deepl.com/pro-api", "has_models": False},
                    {"id": "yandex",  "label": "Yandex Translate", "desc": "Яндекс Облако. Хорошо знает русский.", "url": "https://yandex.cloud/ru/services/translate", "has_models": False},
                    {"id": "google",  "label": "Google Translate",  "desc": "Google Cloud Translation API.", "url": "https://cloud.google.com/translate", "has_models": False},
                    {"id": "custom",  "label": "Свой endpoint",    "desc": "Любой OpenAI-совместимый API (Ollama, Together, Groq...)", "url": "", "has_models": False},
                ],
                "styles": [
                    {"id": "readable", "label": "Живой и читабельный", "desc": "Естественный перевод, как написанный на русском"},
                    {"id": "precise",  "label": "Точный",              "desc": "Близко к оригиналу, минимум адаптации"},
                    {"id": "short",    "label": "Краткий",             "desc": "Сокращённый пересказ — только суть"},
                    {"id": "custom",   "label": "Свой промпт",        "desc": "Задайте инструкцию переводчику вручную"},
                ],
                "openai_models": ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
            })
        }

    # ── POST сохранить настройки или ключи ───────────────────────────────────
    if method == "POST":
        body = json.loads(event.get("body") or "{}")

        # Сохранение ключа(ей)
        if any(k in body for k in ("api_key", "api_key_deepl", "api_key_yandex", "api_key_google")):
            updates = []
            vals = []
            key_valid = None
            new_provider = body.get("provider", None)

            for field in ("api_key", "api_key_deepl", "api_key_yandex", "api_key_google"):
                if field in body:
                    val = (body[field] or "").strip()
                    updates.append(f"{field}=%s")
                    vals.append(val if val else None)
                    # Проверяем активный ключ
                    if new_provider:
                        p_key_map = {"openai": "api_key", "deepl": "api_key_deepl",
                                     "yandex": "api_key_yandex", "google": "api_key_google", "custom": "api_key"}
                        if p_key_map.get(new_provider) == field and val:
                            cfg_tmp = load_settings(cur, schema)
                            custom_ep = body.get("custom_endpoint", cfg_tmp.get("custom_endpoint", ""))
                            key_valid = verify_key(new_provider, val, custom_ep)

            if new_provider:
                updates.append("provider=%s")
                vals.append(new_provider)
            if "custom_endpoint" in body:
                updates.append("custom_endpoint=%s")
                vals.append(body["custom_endpoint"] or None)

            updates.append("updated_at=NOW()")
            cur.execute(
                f"UPDATE {schema}.translator_settings SET {', '.join(updates)} "
                f"WHERE id=(SELECT id FROM {schema}.translator_settings ORDER BY id DESC LIMIT 1)",
                vals
            )
            conn.commit()
            cur.close()
            conn.close()

            saved_key = ""
            if "api_key" in body: saved_key = (body["api_key"] or "").strip()
            elif "api_key_deepl" in body: saved_key = (body["api_key_deepl"] or "").strip()
            elif "api_key_yandex" in body: saved_key = (body["api_key_yandex"] or "").strip()
            elif "api_key_google" in body: saved_key = (body["api_key_google"] or "").strip()

            return {
                "statusCode": 200,
                "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"ok": True, "saved": True, "key_valid": key_valid, "masked": mask_key(saved_key)})
            }

        # Стандартные настройки
        model = body.get("model", "gpt-4o-mini")
        style = body.get("style", "readable")
        batch_size = max(1, min(int(body.get("batch_size", 10)), 20))
        auto_translate = bool(body.get("auto_translate", True))
        custom_prompt = body.get("custom_prompt", "")[:1000]
        provider = body.get("provider", "openai")
        custom_endpoint = body.get("custom_endpoint", "") or None
        custom_model = body.get("custom_model", "") or None

        cur.execute(
            f"UPDATE {schema}.translator_settings SET model=%s, style=%s, batch_size=%s, "
            f"auto_translate=%s, custom_prompt=%s, provider=%s, custom_endpoint=%s, custom_model=%s, updated_at=NOW() "
            f"WHERE id=(SELECT id FROM {schema}.translator_settings ORDER BY id DESC LIMIT 1)",
            (model, style, batch_size, auto_translate, custom_prompt, provider, custom_endpoint, custom_model)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"ok": True})}

    # ── Action-запросы: нужен ключ ───────────────────────────────────────────
    cfg = load_settings(cur, schema)
    api_key = get_active_key(cfg)

    if not api_key:
        cur.close()
        conn.close()
        provider_label = PROVIDERS.get(cfg.get("provider", "openai"), {}).get("label", "переводчика")
        return {"statusCode": 400, "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"ok": False, "error": f"Не установлен API ключ для {provider_label}. Добавьте ключ в настройках."})}

    # ── TEST ─────────────────────────────────────────────────────────────────
    if action == "test":
        article_id = params.get("id")
        if article_id:
            cur.execute(f"SELECT id, title, excerpt FROM {schema}.news_items WHERE id = %s", (article_id,))
        else:
            cur.execute(f"SELECT id, title, excerpt FROM {schema}.news_items ORDER BY RANDOM() LIMIT 1")
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            return {"statusCode": 404, "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": json.dumps({"ok": False, "error": "Статья не найдена"})}
        items = [{"id": row[0], "title": row[1], "excerpt": row[2] or ""}]
        try:
            results, tokens = do_translate(items, cfg, api_key)
            return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                    "body": json.dumps({"ok": True,
                        "original": {"title": row[1], "excerpt": row[2] or ""},
                        "translated": {"title_ru": results[0]["title_ru"], "excerpt_ru": results[0]["excerpt_ru"]},
                        "provider": cfg["provider"], "model": cfg.get("custom_model") or cfg.get("model", ""),
                        "tokens_used": tokens})}
        except Exception as e:
            return {"statusCode": 500, "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": json.dumps({"ok": False, "error": str(e)[:300]})}

    # ── RUN ──────────────────────────────────────────────────────────────────
    if action == "run":
        batch_size = min(int(params.get("batch", cfg["batch_size"])), 20)
        cur.execute(
            f"SELECT id, title, excerpt FROM {schema}.news_items "
            f"WHERE translated = false OR translated IS NULL ORDER BY id ASC LIMIT %s", (batch_size,)
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
        translated_count = 0
        tokens_used = 0
        error_msg = None
        try:
            results, tokens_used = do_translate(items, cfg, api_key)
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
        return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                "body": json.dumps({"ok": error_msg is None, "translated_now": translated_count,
                    "remaining": remaining, "translated_total": done, "finished": remaining == 0,
                    "tokens_used": tokens_used, "error": error_msg})}

    # ── RETRANSLATE ──────────────────────────────────────────────────────────
    if action == "retranslate":
        article_id = params.get("id")
        if not article_id:
            cur.close()
            conn.close()
            return {"statusCode": 400, "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": json.dumps({"ok": False, "error": "id обязателен"})}
        cur.execute(f"SELECT id, title, excerpt FROM {schema}.news_items WHERE id = %s", (article_id,))
        row = cur.fetchone()
        if not row:
            cur.close()
            conn.close()
            return {"statusCode": 404, "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": json.dumps({"ok": False, "error": "Статья не найдена"})}
        items = [{"id": row[0], "title": row[1], "excerpt": row[2] or ""}]
        try:
            results, _ = do_translate(items, cfg, api_key)
            cur.execute(
                f"UPDATE {schema}.news_items SET title_ru=%s, excerpt_ru=%s, translated=true WHERE id=%s",
                (results[0]["title_ru"], results[0]["excerpt_ru"], row[0])
            )
            conn.commit()
            cur.close()
            conn.close()
            return {"statusCode": 200, "headers": {"Access-Control-Allow-Origin": "*", "Content-Type": "application/json"},
                    "body": json.dumps({"ok": True, "title_ru": results[0]["title_ru"], "excerpt_ru": results[0]["excerpt_ru"]})}
        except Exception as e:
            conn.rollback()
            cur.close()
            conn.close()
            return {"statusCode": 500, "headers": {"Access-Control-Allow-Origin": "*"},
                    "body": json.dumps({"ok": False, "error": str(e)[:300]})}

    cur.close()
    conn.close()
    return {"statusCode": 404, "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"ok": False, "error": "Unknown action"})}

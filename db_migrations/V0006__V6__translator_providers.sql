
ALTER TABLE t_p37480106_simple_news_rss_star.translator_settings
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'openai',
  ADD COLUMN IF NOT EXISTS api_key_deepl TEXT,
  ADD COLUMN IF NOT EXISTS api_key_yandex TEXT,
  ADD COLUMN IF NOT EXISTS api_key_google TEXT,
  ADD COLUMN IF NOT EXISTS custom_endpoint TEXT,
  ADD COLUMN IF NOT EXISTS custom_model TEXT;

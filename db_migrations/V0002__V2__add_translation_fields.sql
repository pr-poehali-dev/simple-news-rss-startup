ALTER TABLE t_p37480106_simple_news_rss_star.news_items
  ADD COLUMN IF NOT EXISTS title_ru TEXT,
  ADD COLUMN IF NOT EXISTS excerpt_ru TEXT,
  ADD COLUMN IF NOT EXISTS translated BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_news_items_translated
  ON t_p37480106_simple_news_rss_star.news_items(translated);

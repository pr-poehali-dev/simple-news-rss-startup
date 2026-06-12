
CREATE TABLE t_p37480106_simple_news_rss_star.translator_settings (
  id SERIAL PRIMARY KEY,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  style TEXT NOT NULL DEFAULT 'readable',
  batch_size INTEGER NOT NULL DEFAULT 10,
  auto_translate BOOLEAN NOT NULL DEFAULT true,
  custom_prompt TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO t_p37480106_simple_news_rss_star.translator_settings (model, style, batch_size, auto_translate)
VALUES ('gpt-4o-mini', 'readable', 10, true);

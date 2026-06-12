
CREATE TABLE t_p37480106_simple_news_rss_star.rss_sources (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'Общее',
  active BOOLEAN NOT NULL DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE t_p37480106_simple_news_rss_star.news_items (
  id SERIAL PRIMARY KEY,
  source_id INTEGER REFERENCES t_p37480106_simple_news_rss_star.rss_sources(id),
  guid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT,
  url TEXT NOT NULL,
  image_url TEXT,
  category TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON t_p37480106_simple_news_rss_star.news_items(published_at DESC);
CREATE INDEX ON t_p37480106_simple_news_rss_star.news_items(category);
CREATE INDEX ON t_p37480106_simple_news_rss_star.news_items(source_id);

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'IGN', 'https://feeds.feedburner.com/ign/all', 'Общее', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://feeds.feedburner.com/ign/all');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'Kotaku', 'https://kotaku.com/rss', 'Общее', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://kotaku.com/rss');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'PC Gamer', 'https://www.pcgamer.com/rss/', 'PC', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.pcgamer.com/rss/');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'Eurogamer', 'https://www.eurogamer.net/?format=rss', 'Общее', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.eurogamer.net/?format=rss');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'Rock Paper Shotgun', 'https://www.rockpapershotgun.com/feed', 'PC', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.rockpapershotgun.com/feed');

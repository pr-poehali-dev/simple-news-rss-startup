
INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'IGN Videos', 'https://feeds.feedburner.com/ign/videos', 'Видео', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://feeds.feedburner.com/ign/videos');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'GameSpot Videos', 'https://www.gamespot.com/feeds/mashup/', 'Видео', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.gamespot.com/feeds/mashup/');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'GamesRadar', 'https://www.gamesradar.com/rss/', 'Общее', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.gamesradar.com/rss/');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'VG247', 'https://www.vg247.com/feed', 'Общее', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.vg247.com/feed');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'Destructoid', 'https://www.destructoid.com/feed/', 'Общее', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.destructoid.com/feed/');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'Polygon', 'https://www.polygon.com/rss/index.xml', 'Общее', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.polygon.com/rss/index.xml');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'PCGamesN', 'https://www.pcgamesn.com/mainrss.xml', 'PC', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://www.pcgamesn.com/mainrss.xml');

INSERT INTO t_p37480106_simple_news_rss_star.rss_sources (name, url, category, active)
SELECT 'Dota 2 / Steam News', 'https://store.steampowered.com/feeds/news/app/570/', 'Киберспорт', true
WHERE NOT EXISTS (SELECT 1 FROM t_p37480106_simple_news_rss_star.rss_sources WHERE url = 'https://store.steampowered.com/feeds/news/app/570/');

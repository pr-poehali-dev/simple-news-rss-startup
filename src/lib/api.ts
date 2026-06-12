const URLS = {
  newsApi: "https://functions.poehali.dev/8e62e8fb-9b86-4433-a386-a378b856492a",
  adminApi: "https://functions.poehali.dev/7deec7a2-719b-4330-90bf-f26f19750528",
  rssFetch: "https://functions.poehali.dev/47f8b119-e276-4ac1-9638-9ef9b991b54b",
  rssScheduler: "https://functions.poehali.dev/b6e7e7ea-b0c5-47a0-91dc-6b35040dfe0e",
  translateBatch: "https://functions.poehali.dev/d5af4d4d-796f-434e-8ea4-b3acd0e2d0c8",
};

export const ADMIN_TOKEN = "gamefeed-admin-2025";

export interface NewsItem {
  id: number;
  title: string;
  title_original?: string;
  excerpt: string;
  url: string;
  image: string;
  category: string;
  time: string;
  published_at: string;
  translated?: boolean;
  source: string;
}

export interface NewsDetail extends NewsItem {
  source_url: string;
  prev: { id: number; title: string } | null;
  next: { id: number; title: string } | null;
}

export interface RssSource {
  id: number;
  name: string;
  url: string;
  category: string;
  active: boolean;
  last_fetched_at: string | null;
  news_count: number;
}

export interface AdminStats {
  total_news: number;
  active_sources: number;
}

export async function fetchNews(params: {
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: NewsItem[]; total: number; categories: string[] }> {
  const q = new URLSearchParams();
  if (params.category && params.category !== "Все") q.set("category", params.category);
  if (params.search) q.set("search", params.search);
  if (params.limit) q.set("limit", String(params.limit));
  if (params.offset) q.set("offset", String(params.offset));
  const res = await fetch(`${URLS.newsApi}?${q}`);
  const data = await res.json();
  return data;
}

export async function fetchAdminSources(): Promise<{ sources: RssSource[]; stats: AdminStats }> {
  const res = await fetch(URLS.adminApi, {
    headers: { "X-Admin-Token": ADMIN_TOKEN },
  });
  return res.json();
}

export async function addSource(body: { name: string; url: string; category: string }): Promise<{ ok: boolean; id?: number; error?: string }> {
  const res = await fetch(URLS.adminApi, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": ADMIN_TOKEN },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function toggleSource(id: number): Promise<{ ok: boolean; active?: boolean }> {
  const res = await fetch(`${URLS.adminApi}?action=toggle&id=${id}`, {
    method: "PUT",
    headers: { "X-Admin-Token": ADMIN_TOKEN },
  });
  return res.json();
}

export async function triggerRssFetch(sourceId?: number): Promise<{ ok: boolean; total_added: number }> {
  const q = sourceId ? `?source_id=${sourceId}` : "";
  const res = await fetch(`${URLS.rssFetch}${q}`);
  return res.json();
}

export async function fetchNewsById(id: number): Promise<{ ok: boolean; item?: NewsDetail; error?: string }> {
  const res = await fetch(`${URLS.newsApi}?id=${id}`);
  return res.json();
}

export async function getTranslateStats(): Promise<{ ok: boolean; translated: number; remaining: number; finished: boolean }> {
  const res = await fetch(`${URLS.translateBatch}?stats=1`);
  return res.json();
}

export async function translateNextBatch(batchSize = 10): Promise<{
  ok: boolean;
  translated_now: number;
  remaining: number;
  finished: boolean;
  error?: string;
}> {
  const res = await fetch(`${URLS.translateBatch}?batch=${batchSize}`);
  return res.json();
}

export async function runScheduler(force = false): Promise<{
  ok: boolean;
  skipped?: boolean;
  total_added?: number;
  next_run_in_seconds?: number;
  last_fetched?: string;
  ran_at?: string;
}> {
  const q = force ? "?force=1" : "";
  const res = await fetch(`${URLS.rssScheduler}${q}`);
  return res.json();
}
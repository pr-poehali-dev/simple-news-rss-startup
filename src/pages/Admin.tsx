import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import {
  fetchAdminSources,
  addSource,
  toggleSource,
  triggerRssFetch,
  runScheduler,
  getTranslateStats,
  translateNextBatch,
  seedContent,
  RssSource,
  AdminStats,
} from "@/lib/api";

const CATEGORIES = ["Общее", "PC", "Консоли", "Мобильные", "Киберспорт", "Инди", "RPG", "Шутеры"];

export default function Admin() {
  const [sources, setSources] = useState<RssSource[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState<number | "all" | null>(null);
  const [form, setForm] = useState({ name: "", url: "", category: "Общее" });
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [toast, setToast] = useState("");

  // Translation state
  const [translateStats, setTranslateStats] = useState<{ translated: number; remaining: number; finished: boolean } | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateLog, setTranslateLog] = useState<string[]>([]);
  const translateRunning = useRef(false);

  // Seed state
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    setLoading(true);
    const [data, ts] = await Promise.all([fetchAdminSources(), getTranslateStats()]);
    setSources(data.sources || []);
    setStats(data.stats || null);
    setTranslateStats(ts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const handleToggle = async (id: number) => {
    await toggleSource(id);
    setSources((prev) => prev.map((s) => s.id === id ? { ...s, active: !s.active } : s));
  };

  const handleFetch = async (sourceId?: number) => {
    setFetching(sourceId ?? "all");
    if (sourceId) {
      const res = await triggerRssFetch(sourceId);
      showToast(`Добавлено новых статей: ${res.total_added}`);
    } else {
      const res = await runScheduler(true);
      showToast(`Готово! Добавлено новых статей: ${res.total_added ?? 0}`);
    }
    setFetching(null);
    load();
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError("");
    if (!form.name.trim() || !form.url.trim()) { setAddError("Заполните название и URL"); return; }
    setAddLoading(true);
    const res = await addSource(form);
    setAddLoading(false);
    if (res.ok) {
      setForm({ name: "", url: "", category: "Общее" });
      showToast("Источник добавлен");
      load();
    } else {
      setAddError(res.error || "Ошибка при добавлении");
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    showToast("Генерируем 30 новостей через ИИ...");
    const res = await seedContent();
    setSeeding(false);
    if (res.ok) {
      showToast(`Добавлено ${res.added} новых статей из ${res.generated} сгенерированных!`);
      load();
    } else {
      showToast(`Ошибка: ${res.error}`);
    }
  };

  // Запускаем перевод по цепочке батчей
  const handleTranslateAll = async () => {
    if (translating) return;
    setTranslating(true);
    translateRunning.current = true;
    setTranslateLog([]);

    let remaining = translateStats?.remaining ?? 0;
    let totalDone = 0;

    while (translateRunning.current && remaining > 0) {
      const res = await translateNextBatch(10);
      totalDone += res.translated_now;
      remaining = res.remaining;

      setTranslateStats({ translated: (translateStats?.translated ?? 0) + totalDone, remaining, finished: res.finished });
      setTranslateLog((prev) => [
        ...prev,
        `✓ Переведено ещё ${res.translated_now} статей. Осталось: ${remaining}`,
      ]);

      if (res.finished || res.error) {
        if (res.error) setTranslateLog((prev) => [...prev, `⚠ Ошибка: ${res.error}`]);
        break;
      }
      // небольшая пауза между батчами
      await new Promise((r) => setTimeout(r, 800));
    }

    translateRunning.current = false;
    setTranslating(false);
    showToast(`Перевод завершён! Переведено статей: ${totalDone}`);
    load();
  };

  const handleStopTranslate = () => {
    translateRunning.current = false;
    setTranslating(false);
    setTranslateLog((prev) => [...prev, "— Перевод остановлен вручную"]);
  };

  const total = (translateStats?.translated ?? 0) + (translateStats?.remaining ?? 0);
  const progress = total > 0 ? Math.round(((translateStats?.translated ?? 0) / total) * 100) : 0;

  return (
    <div className="min-h-screen gradient-bg">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg font-golos text-sm animate-fade-in">
          {toast}
        </div>
      )}

      <header className="border-b border-border/60 backdrop-blur-xl bg-background/80 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-muted-foreground hover:text-primary transition-colors">
              <Icon name="ArrowLeft" size={18} />
            </a>
            <div className="w-7 h-7 rounded bg-primary/20 border border-primary/50 flex items-center justify-center">
              <Icon name="Zap" size={14} className="text-primary" />
            </div>
            <span className="font-rajdhani font-bold text-lg tracking-widest uppercase">
              Game<span className="text-primary">Feed</span>
              <span className="text-muted-foreground text-sm ml-2 font-golos normal-case tracking-normal">Админ-панель</span>
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => handleFetch()}
            disabled={fetching === "all"}
            className="bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide h-8 px-4 gap-2"
          >
            <Icon name={fetching === "all" ? "Loader" : "RefreshCw"} size={14} className={fetching === "all" ? "animate-spin" : ""} />
            Обновить все
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: "Всего новостей", value: stats.total_news, icon: "Newspaper" },
              { label: "Активных источников", value: stats.active_sources, icon: "Rss" },
              { label: "Переведено", value: translateStats?.translated ?? "—", icon: "Languages" },
              { label: "Не переведено", value: translateStats?.remaining ?? "—", icon: "Globe" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Icon name={s.icon as never} size={14} className="text-primary" />
                  <span className="text-xs text-muted-foreground font-golos">{s.label}</span>
                </div>
                <p className="font-rajdhani font-bold text-2xl text-foreground">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Seed content block */}
        <div className="rounded-xl border border-primary/20 bg-card p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2 mb-1">
                <Icon name="Sparkles" size={16} className="text-primary" />
                Заполнить базу контентом
              </h2>
              <p className="text-sm text-muted-foreground font-golos max-w-lg">
                ИИ сгенерирует 30 реалистичных игровых новостей на русском языке и добавит их в базу. Идеально для быстрого старта.
              </p>
            </div>
            <Button
              onClick={handleSeed}
              disabled={seeding}
              className="bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide h-9 px-5 gap-2 flex-shrink-0"
            >
              <Icon name={seeding ? "Loader" : "Wand2"} size={15} className={seeding ? "animate-spin" : ""} />
              {seeding ? "Генерируем..." : "Сгенерировать 30 новостей"}
            </Button>
          </div>
        </div>

        {/* Translation block */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2">
              <Icon name="Languages" size={16} className="text-primary" />
              Перевод на русский язык
            </h2>
            <div className="flex gap-2">
              {translating ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleStopTranslate}
                  className="border-destructive text-destructive hover:bg-destructive/10 font-rajdhani font-semibold h-8 px-4"
                >
                  <Icon name="Square" size={13} className="mr-1" /> Остановить
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleTranslateAll}
                  disabled={translateStats?.finished || translateStats?.remaining === 0}
                  className="bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide h-8 px-4 gap-2"
                >
                  <Icon name="Sparkles" size={14} />
                  {translateStats?.finished ? "Всё переведено" : `Перевести все (${translateStats?.remaining ?? "…"})`}
                </Button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {total > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-xs text-muted-foreground font-golos mb-1">
                <span>Прогресс перевода</span>
                <span>{translateStats?.translated ?? 0} / {total} статей ({progress}%)</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {translateStats?.finished && (
            <p className="flex items-center gap-2 text-sm text-primary font-golos">
              <Icon name="CheckCircle" size={14} /> Все статьи переведены на русский язык
            </p>
          )}

          {/* Log */}
          {translateLog.length > 0 && (
            <div className="mt-3 max-h-36 overflow-y-auto rounded-lg bg-secondary/40 p-3 space-y-1">
              {translateLog.map((line, i) => (
                <p key={i} className="text-xs font-golos text-muted-foreground">{line}</p>
              ))}
              {translating && (
                <p className="text-xs font-golos text-primary flex items-center gap-1">
                  <Icon name="Loader" size={10} className="animate-spin" /> Переводим следующий батч…
                </p>
              )}
            </div>
          )}
        </div>

        {/* Add source form */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest mb-4 flex items-center gap-2">
            <Icon name="Plus" size={16} className="text-primary" />
            Добавить RSS-источник
          </h2>
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Название (напр. IGN)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="bg-secondary/60 border-border/60 font-golos h-9"
            />
            <Input
              placeholder="URL RSS-ленты"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="bg-secondary/60 border-border/60 font-golos h-9 sm:flex-[2]"
            />
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="h-9 rounded-md border border-border/60 bg-secondary/60 text-foreground px-3 text-sm font-golos focus:outline-none focus:border-primary/60 flex-shrink-0"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <Button
              type="submit"
              disabled={addLoading}
              size="sm"
              className="bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide h-9 px-5 flex-shrink-0"
            >
              {addLoading ? <Icon name="Loader" size={14} className="animate-spin" /> : "Добавить"}
            </Button>
          </form>
          {addError && <p className="mt-2 text-xs text-destructive font-golos">{addError}</p>}
        </div>

        {/* Sources list */}
        <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
          <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between">
            <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2">
              <Icon name="Rss" size={16} className="text-primary" />
              RSS-источники
            </h2>
            <span className="text-xs text-muted-foreground font-golos">{sources.length} источников</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Icon name="Loader" size={24} className="animate-spin text-primary" />
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {sources.map((src) => (
                <div key={src.id} className={`px-5 py-4 flex items-center gap-4 transition-colors ${!src.active ? "opacity-50" : ""}`}>
                  <div className="w-9 h-9 rounded-lg bg-secondary border border-border/60 flex items-center justify-center flex-shrink-0">
                    <Icon name="Rss" size={15} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-golos font-medium text-sm text-foreground">{src.name}</span>
                      <Badge className="bg-secondary text-muted-foreground border-border/40 text-xs font-golos">{src.category}</Badge>
                      <span className="text-xs text-primary/70 font-golos">{src.news_count} статей</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-golos truncate mt-0.5">{src.url}</p>
                    {src.last_fetched_at && (
                      <p className="text-xs text-muted-foreground/60 font-golos mt-0.5">
                        Обновлено: {new Date(src.last_fetched_at).toLocaleString("ru")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleFetch(src.id)}
                      disabled={fetching === src.id}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-primary"
                      title="Обновить этот источник"
                    >
                      <Icon name={fetching === src.id ? "Loader" : "RefreshCw"} size={14} className={fetching === src.id ? "animate-spin" : ""} />
                    </Button>
                    <button
                      onClick={() => handleToggle(src.id)}
                      className={`relative w-10 h-5 rounded-full border transition-all flex-shrink-0 ${
                        src.active ? "bg-primary/30 border-primary" : "bg-secondary border-border/60"
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                        src.active ? "left-5 bg-primary" : "left-0.5 bg-muted-foreground"
                      }`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
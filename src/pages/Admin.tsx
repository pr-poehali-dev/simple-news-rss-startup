import { useEffect, useState } from "react";
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

  // Translation state (краткая статистика для карточки)
  const [translateStats, setTranslateStats] = useState<{ translated: number; remaining: number; finished: boolean } | null>(null);

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

  const total = (translateStats?.translated ?? 0) + (translateStats?.remaining ?? 0);

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

        {/* Translation — link to dedicated page */}
        <a
          href="/admin/translator"
          className="rounded-xl border border-border/60 bg-card p-5 flex items-center gap-4 hover:border-primary/50 transition-all group block card-hover"
        >
          <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center flex-shrink-0">
            <Icon name="Languages" size={20} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest group-hover:text-primary transition-colors flex items-center gap-2">
              Переводчик
              {translateStats?.remaining !== undefined && translateStats.remaining > 0 && (
                <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded font-golos normal-case tracking-normal">
                  {translateStats.remaining} ожидают
                </span>
              )}
              {translateStats?.finished && (
                <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 rounded font-golos normal-case tracking-normal flex items-center gap-1">
                  <Icon name="CheckCircle" size={10} /> Всё переведено
                </span>
              )}
            </h2>
            <p className="text-sm text-muted-foreground font-golos mt-0.5">
              Настройки модели, стиль перевода, тест и массовый запуск
            </p>
            {translateStats && (
              <div className="mt-2 flex items-center gap-3">
                <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${total > 0 ? Math.round(((translateStats.translated ?? 0) / total) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground font-golos flex-shrink-0">
                  {translateStats.translated ?? 0} / {total}
                </span>
              </div>
            )}
          </div>
          <Icon name="ChevronRight" size={18} className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
        </a>

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
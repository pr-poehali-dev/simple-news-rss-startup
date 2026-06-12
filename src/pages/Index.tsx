import { useState, useEffect, useCallback } from "react";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { fetchNews, runScheduler, NewsItem } from "@/lib/api";

const STATIC_CATEGORIES = ["Все", "Общее", "PC", "Консоли", "Мобильные", "Киберспорт", "Инди", "RPG", "Шутеры"];
const TAGS = ["#открытыймир", "#мультиплеер", "#ранний_доступ", "#DLC", "#патч", "#анонс", "#обзор", "#стрим"];
const SUBSCRIPTIONS = [
  { name: "IGN Russia", icon: "Tv", count: "1.2M" },
  { name: "StopGame.ru", icon: "Monitor", count: "890K" },
  { name: "Riot Games", icon: "Sword", count: "3.4M" },
];

function SkeletonCard({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`rounded-xl border border-border/60 bg-card overflow-hidden ${tall ? "h-72" : "h-44"} animate-pulse`}>
      <div className="w-full h-full bg-secondary/40" />
    </div>
  );
}

export default function Index() {
  const [activeCategory, setActiveCategory] = useState("Все");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [subscribed, setSubscribed] = useState<string[]>([]);
  const [items, setItems] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<string[]>(STATIC_CATEGORIES);
  const [newCount, setNewCount] = useState(0);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchNews({
        category: activeCategory,
        search: debouncedSearch,
        limit: 40,
      });
      const incoming = data.items || [];
      setItems((prev) => {
        if (silent && prev.length > 0 && incoming.length > 0) {
          const prevTopId = prev[0]?.id;
          const newItems = incoming.filter((n) => n.id > (prevTopId ?? 0));
          if (newItems.length > 0) {
            setNewCount((c) => c + newItems.length);
            return prev; // не обновляем пока пользователь сам не нажмёт
          }
        }
        return incoming;
      });
      setTotal(data.total || 0);
      if (data.categories?.length) {
        setCategories(["Все", ...data.categories]);
      }
    } catch {
      if (!silent) setItems([]);
    }
    if (!silent) setLoading(false);
  }, [activeCategory, debouncedSearch]);

  useEffect(() => { load(); }, [load]);

  // Автообновление RSS при загрузке (тихо, раз в 30 мин)
  useEffect(() => {
    runScheduler(false).then((res) => {
      if (!res.skipped && res.total_added && res.total_added > 0) {
        load(true);
      }
    }).catch(() => {});
  }, []);

  // Polling: проверяем новые статьи каждые 3 минуты
  useEffect(() => {
    const interval = setInterval(() => {
      runScheduler(false).catch(() => {});
      load(true);
    }, 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [load]);

  const applyNewItems = () => {
    setNewCount(0);
    load(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleTag = (tag: string) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const toggleSubscribe = (name: string) => {
    setSubscribed((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const featured = items.find((n) => n.image);
  const rest = items.filter((n) => n.id !== featured?.id);

  return (
    <div className="min-h-screen gradient-bg scanline">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 backdrop-blur-xl bg-background/80">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <div className="flex items-center gap-2 mr-4">
            <div className="w-8 h-8 rounded bg-primary/20 border border-primary/50 flex items-center justify-center animate-pulse-glow">
              <Icon name="Zap" size={16} className="text-primary" />
            </div>
            <span className="font-rajdhani font-bold text-xl tracking-widest text-foreground uppercase">
              Game<span className="text-primary neon-text-glow">Feed</span>
            </span>
          </div>

          <div className="flex-1 max-w-md relative">
            <Icon name="Search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Поиск новостей..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-secondary/60 border-border/60 text-sm h-9 focus:border-primary/60 font-golos"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <a
              href="/admin"
              className="text-muted-foreground hover:text-primary transition-colors p-2"
              title="Админ-панель"
            >
              <Icon name="Settings" size={16} />
            </a>
            <Button size="sm" className="bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide h-8 px-4 hover:bg-primary/90">
              Войти
            </Button>
          </div>
        </div>

        {/* Categories */}
        <div className="max-w-7xl mx-auto px-4 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`tag-btn flex-shrink-0 px-3 py-1 rounded border text-sm font-golos font-medium transition-all
                  ${activeCategory === cat
                    ? "bg-primary/20 border-primary text-primary"
                    : "border-border/50 text-muted-foreground bg-secondary/40"
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* New articles banner */}
      {newCount > 0 && (
        <div className="sticky top-[97px] z-40 flex justify-center py-2 pointer-events-none">
          <button
            onClick={applyNewItems}
            className="pointer-events-auto animate-fade-in flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg font-golos font-medium text-sm neon-glow-green hover:bg-primary/90 transition-all"
          >
            <Icon name="ArrowUp" size={14} />
            {newCount} {newCount === 1 ? "новая статья" : newCount < 5 ? "новые статьи" : "новых статей"} — обновить ленту
          </button>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Main Feed */}
        <main className="flex-1 min-w-0">
          {loading ? (
            <>
              <SkeletonCard tall />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
              </div>
            </>
          ) : (
            <>
              {/* Featured */}
              {featured && (
                <a
                  href={`/news/${featured.id}`}
                  className="animate-fade-in mb-6 rounded-xl overflow-hidden border border-border/60 card-hover cursor-pointer group relative block"
                >
                  <div className="relative h-72 overflow-hidden">
                    <img
                      src={featured.image}
                      alt={featured.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                    <Badge className="absolute top-3 right-3 bg-primary/20 text-primary border-primary/40 font-golos text-xs">
                      {featured.category}
                    </Badge>
                    {featured.source && (
                      <span className="absolute top-3 left-3 bg-black/60 text-white text-xs font-golos px-2 py-0.5 rounded backdrop-blur-sm">
                        {featured.source}
                      </span>
                    )}
                    {featured.translated && (
                      <span className="absolute bottom-3 right-3 flex items-center gap-1 text-xs bg-primary/80 text-primary-foreground px-2 py-0.5 rounded font-golos backdrop-blur-sm">
                        <Icon name="Languages" size={10} /> RU
                      </span>
                    )}
                  </div>
                  <div className="p-5 bg-card">
                    <h2 className="font-rajdhani font-bold text-2xl leading-tight mb-2 group-hover:text-primary transition-colors">
                      {featured.title}
                    </h2>
                    <p className="text-muted-foreground text-sm font-golos leading-relaxed mb-3 line-clamp-2">
                      {featured.excerpt}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground font-golos">
                      <span className="flex items-center gap-1"><Icon name="Clock" size={11} />{featured.time}</span>
                      <span className="flex items-center gap-1"><Icon name="BookOpen" size={11} />Читать</span>
                    </div>
                  </div>
                </a>
              )}

              {/* News Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {rest.map((item, i) => (
                  <a
                    key={item.id}
                    href={`/news/${item.id}`}
                    className={`animate-fade-in stagger-${Math.min(i + 1, 6)} rounded-xl border border-border/60 bg-card overflow-hidden card-hover cursor-pointer group block`}
                  >
                    {item.image && (
                      <div className="relative h-44 overflow-hidden">
                        <img
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                        <Badge className="absolute top-2 left-2 bg-card/80 text-foreground/80 border-border/40 font-golos text-xs backdrop-blur-sm">
                          {item.category}
                        </Badge>
                        {item.translated && (
                          <span className="absolute bottom-2 right-2 flex items-center gap-1 text-xs bg-primary/70 text-primary-foreground px-1.5 py-0.5 rounded font-golos">
                            <Icon name="Languages" size={9} /> RU
                          </span>
                        )}
                      </div>
                    )}
                    <div className={`p-4 ${!item.image ? "border-l-2 border-primary/50" : ""}`}>
                      {!item.image && (
                        <div className="flex items-center gap-2 mb-2">
                          <Badge className="bg-secondary text-muted-foreground border-border/40 font-golos text-xs">
                            {item.category}
                          </Badge>
                          {item.translated && (
                            <span className="flex items-center gap-1 text-xs text-primary/70 font-golos">
                              <Icon name="Languages" size={10} /> RU
                            </span>
                          )}
                        </div>
                      )}
                      <h3 className="font-rajdhani font-semibold text-lg leading-tight mb-1.5 group-hover:text-primary transition-colors line-clamp-2">
                        {item.title}
                      </h3>
                      <p className="text-muted-foreground text-xs font-golos leading-relaxed mb-3 line-clamp-2">
                        {item.excerpt}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground font-golos">
                        <span className="flex items-center gap-1"><Icon name="Clock" size={10} />{item.time}</span>
                        {item.source && (
                          <span className="text-primary/60 truncate">{item.source}</span>
                        )}
                      </div>
                    </div>
                  </a>
                ))}
              </div>

              {items.length === 0 && (
                <div className="text-center py-20 text-muted-foreground font-golos">
                  <Icon name="SearchX" size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="mb-4">Новостей пока нет</p>
                  <p className="text-xs opacity-60">Перейдите в <a href="/admin" className="text-primary hover:underline">Админ-панель</a> и нажмите «Обновить все»</p>
                </div>
              )}

              {total > items.length && (
                <div className="text-center mt-6">
                  <span className="text-xs text-muted-foreground font-golos">Показано {items.length} из {total} новостей</span>
                </div>
              )}
            </>
          )}
        </main>

        {/* Sidebar */}
        <aside className="w-72 flex-shrink-0 hidden lg:block space-y-5">
          {/* Tags */}
          <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in stagger-1">
            <h3 className="font-rajdhani font-bold text-base uppercase tracking-widest text-foreground mb-3 flex items-center gap-2">
              <Icon name="Hash" size={14} className="text-primary" />
              Теги
            </h3>
            <div className="flex flex-wrap gap-2">
              {TAGS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`tag-btn px-2.5 py-1 rounded border text-xs font-golos transition-all ${
                    activeTags.includes(tag) ? "active" : "border-border/50 text-muted-foreground"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {activeTags.length > 0 && (
              <button
                onClick={() => setActiveTags([])}
                className="mt-2 text-xs text-muted-foreground hover:text-primary transition-colors font-golos"
              >
                Сбросить фильтры
              </button>
            )}
          </div>

          {/* Subscriptions */}
          <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in stagger-2">
            <h3 className="font-rajdhani font-bold text-base uppercase tracking-widest text-foreground mb-3 flex items-center gap-2">
              <Icon name="Bell" size={14} className="text-primary" />
              Подписки
            </h3>
            <div className="space-y-3">
              {SUBSCRIPTIONS.map((sub) => (
                <div key={sub.name} className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary border border-border/60 flex items-center justify-center flex-shrink-0">
                    <Icon name={sub.icon} size={16} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-golos font-medium text-sm text-foreground truncate">{sub.name}</p>
                    <p className="text-xs text-muted-foreground font-golos">{sub.count} подписчиков</p>
                  </div>
                  <button
                    onClick={() => toggleSubscribe(sub.name)}
                    className={`flex-shrink-0 px-2.5 py-1 rounded text-xs font-rajdhani font-semibold uppercase tracking-wide border transition-all ${
                      subscribed.includes(sub.name)
                        ? "bg-primary/20 border-primary text-primary"
                        : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-primary"
                    }`}
                  >
                    {subscribed.includes(sub.name) ? "Подписан" : "Подписаться"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Trending */}
          {items.length > 0 && (
            <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in stagger-3">
              <h3 className="font-rajdhani font-bold text-base uppercase tracking-widest text-foreground mb-3 flex items-center gap-2">
                <Icon name="TrendingUp" size={14} className="text-primary" />
                Последние
              </h3>
              <div className="space-y-3">
                {items.slice(0, 5).map((item, i) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex gap-3 cursor-pointer group"
                  >
                    <span className="font-rajdhani font-bold text-2xl text-border w-7 flex-shrink-0 leading-none">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="font-golos text-xs text-foreground/90 leading-snug group-hover:text-primary transition-colors line-clamp-2">
                        {item.title}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 font-golos">{item.time}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Admin shortcut */}
          <a
            href="/admin"
            className="rounded-xl border border-border/60 bg-card p-4 flex items-center gap-3 hover:border-primary/40 transition-colors group block"
          >
            <div className="w-8 h-8 rounded-lg bg-secondary border border-border/60 flex items-center justify-center">
              <Icon name="Settings" size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div>
              <p className="font-golos font-medium text-sm text-foreground">Админ-панель</p>
              <p className="text-xs text-muted-foreground font-golos">Управление источниками</p>
            </div>
            <Icon name="ChevronRight" size={14} className="text-muted-foreground ml-auto" />
          </a>
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-8 py-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground font-golos">
          <span className="font-rajdhani font-semibold tracking-widest uppercase">
            Game<span className="text-primary">Feed</span> © 2025
          </span>
          <div className="flex gap-4">
            <a href="/admin" className="hover:text-primary transition-colors">Админ</a>
            <a href="#" className="hover:text-primary transition-colors">О проекте</a>
            <a href="#" className="hover:text-primary transition-colors">Контакты</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
import { useState } from "react";
import Icon from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const IMG1 = "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/6c3a6321-c3ef-4f09-86f0-7e2fae796585.jpg";
const IMG2 = "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/6871d83a-8d84-4793-9df6-8bcea0ae44e8.jpg";
const IMG3 = "https://cdn.poehali.dev/projects/973edfaa-a323-4093-b6b0-33c1214206be/files/af879cd1-5927-43f0-8fbc-8e46fe0e0265.jpg";

const CATEGORIES = ["Все", "RPG", "Шутеры", "Стратегии", "Инди", "Киберспорт", "Обновления"];

const TAGS = ["#открытыймир", "#мультиплеер", "#ранний_доступ", "#DLC", "#патч", "#анонс", "#обзор", "#стрим"];

interface NewsItem {
  id: number;
  type: "news" | "video" | "short";
  category: string;
  title: string;
  excerpt: string;
  image: string;
  time: string;
  views: string;
  tags: string[];
  hot: boolean;
  duration?: string;
}

const NEWS: NewsItem[] = [
  {
    id: 1,
    type: "news",
    category: "RPG",
    title: "Elden Ring: Shadow of the Erdtree установил рекорд продаж за первую неделю",
    excerpt: "Дополнение превзошло все ожидания, продав более 5 миллионов копий за 7 дней после релиза. FromSoftware подтвердили работу над следующим крупным проектом.",
    image: IMG2,
    time: "2 часа назад",
    views: "48.2K",
    tags: ["#DLC", "#обзор"],
    hot: true,
  },
  {
    id: 2,
    type: "video",
    category: "Шутеры",
    title: "Новый геймплей Cyberpunk 2077 — патч 2.5 полностью меняет боевую систему",
    excerpt: "CD Projekt Red выпустили 20-минутный геймплей с обновлённой системой стелса, новыми кибервозможностями и расширенным ИИ противников.",
    image: IMG3,
    time: "4 часа назад",
    views: "31.7K",
    tags: ["#патч", "#стрим"],
    hot: false,
    duration: "20:14",
  },
  {
    id: 3,
    type: "news",
    category: "Киберспорт",
    title: "The International 2025: Team Spirit выходит в финал с разгромным счётом 3:0",
    excerpt: "Российская команда уверенно прошла полуфинал против европейской сборной и готовится к решающей схватке за главный приз турнира в $40 млн.",
    image: IMG1,
    time: "6 часов назад",
    views: "62.1K",
    tags: ["#мультиплеер", "#анонс"],
    hot: true,
  },
  {
    id: 4,
    type: "short",
    category: "Инди",
    title: "Hollow Knight: Silksong наконец получил дату выхода",
    excerpt: "Team Cherry подтвердили: релиз состоится 14 марта 2025 года на PC и Nintendo Switch.",
    image: "",
    time: "1 день назад",
    views: "19.4K",
    tags: ["#анонс"],
    hot: false,
  },
  {
    id: 5,
    type: "short",
    category: "Обновления",
    title: "Valve анонсировала обновление Steam с новым интерфейсом библиотеки",
    excerpt: "Редизайн затронет главную страницу, профили и систему достижений — бета уже доступна.",
    image: "",
    time: "1 день назад",
    views: "11.8K",
    tags: ["#патч"],
    hot: false,
  },
  {
    id: 6,
    type: "video",
    category: "Стратегии",
    title: "Обзор Civilization VII: стоит ли покупать через месяц после выхода?",
    excerpt: "Разбираем все патчи, DLC и актуальное состояние игры в 2025 году. Спойлер: стало гораздо лучше.",
    image: IMG1,
    time: "2 дня назад",
    views: "27.3K",
    tags: ["#обзор"],
    hot: false,
    duration: "35:47",
  },
];

const SUBSCRIPTIONS = [
  { name: "IGN Russia", icon: "Tv", count: "1.2M" },
  { name: "StopGame.ru", icon: "Monitor", count: "890K" },
  { name: "Riot Games", icon: "Sword", count: "3.4M" },
];

export default function Index() {
  const [activeCategory, setActiveCategory] = useState("Все");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [subscribed, setSubscribed] = useState<string[]>([]);

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

  const filtered = NEWS.filter((item) => {
    const matchCat = activeCategory === "Все" || item.category === activeCategory;
    const matchTags = activeTags.length === 0 || activeTags.some((t) => item.tags.includes(t));
    const matchSearch =
      searchQuery === "" ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.excerpt.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchTags && matchSearch;
  });

  const featured = filtered.find((n) => n.type === "news" && n.image);
  const rest = filtered.filter((n) => n.id !== featured?.id);

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
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
              <Icon name="Bell" size={16} />
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide h-8 px-4 hover:bg-primary/90">
              Войти
            </Button>
          </div>
        </div>

        {/* Categories */}
        <div className="max-w-7xl mx-auto px-4 pb-3">
          <div className="flex items-center gap-2 overflow-x-auto">
            {CATEGORIES.map((cat) => (
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

      <div className="max-w-7xl mx-auto px-4 py-6 flex gap-6">
        {/* Main Feed */}
        <main className="flex-1 min-w-0">
          {/* Featured */}
          {featured && (
            <div className="animate-fade-in mb-6 rounded-xl overflow-hidden border border-border/60 card-hover cursor-pointer group relative">
              <div className="relative h-72 overflow-hidden">
                <img
                  src={featured.image}
                  alt={featured.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
                {featured.hot && (
                  <span className="absolute top-3 left-3 bg-red-500/90 text-white text-xs font-rajdhani font-semibold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                    <Icon name="Flame" size={11} /> Топ
                  </span>
                )}
                <Badge className="absolute top-3 right-3 bg-primary/20 text-primary border-primary/40 font-golos text-xs">
                  {featured.category}
                </Badge>
              </div>
              <div className="p-5 bg-card">
                <h2 className="font-rajdhani font-bold text-2xl leading-tight mb-2 group-hover:text-primary transition-colors">
                  {featured.title}
                </h2>
                <p className="text-muted-foreground text-sm font-golos leading-relaxed mb-3">{featured.excerpt}</p>
                <div className="flex items-center gap-4 text-xs text-muted-foreground font-golos">
                  <span className="flex items-center gap-1"><Icon name="Clock" size={11} />{featured.time}</span>
                  <span className="flex items-center gap-1"><Icon name="Eye" size={11} />{featured.views}</span>
                  <div className="flex gap-1 ml-auto">
                    {featured.tags.map((t) => (
                      <span key={t} className="text-primary/70 text-xs">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* News Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rest.map((item, i) => (
              <article
                key={item.id}
                className={`animate-fade-in stagger-${Math.min(i + 1, 6)} rounded-xl border border-border/60 bg-card overflow-hidden card-hover cursor-pointer group`}
              >
                {item.image && (
                  <div className="relative h-44 overflow-hidden">
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-card/80 to-transparent" />
                    {item.type === "video" && item.duration && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 rounded-full bg-black/60 border border-white/30 flex items-center justify-center backdrop-blur-sm group-hover:border-primary/60 group-hover:bg-primary/20 transition-all">
                          <Icon name="Play" size={16} className="text-white ml-0.5" />
                        </div>
                      </div>
                    )}
                    {item.duration && (
                      <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-golos">
                        {item.duration}
                      </span>
                    )}
                    <Badge className="absolute top-2 left-2 bg-card/80 text-foreground/80 border-border/40 font-golos text-xs backdrop-blur-sm">
                      {item.category}
                    </Badge>
                    {item.hot && (
                      <span className="absolute top-2 right-2 bg-red-500/90 text-white text-xs font-rajdhani font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide flex items-center gap-1">
                        <Icon name="Flame" size={10} /> Топ
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
                      {item.type === "short" && (
                        <span className="text-xs text-primary/70 font-rajdhani font-semibold uppercase tracking-wider">Кратко</span>
                      )}
                    </div>
                  )}
                  <h3 className="font-rajdhani font-semibold text-lg leading-tight mb-1.5 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-xs font-golos leading-relaxed mb-3 line-clamp-2">
                    {item.excerpt}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground font-golos">
                    <span className="flex items-center gap-1"><Icon name="Clock" size={10} />{item.time}</span>
                    <span className="flex items-center gap-1"><Icon name="Eye" size={10} />{item.views}</span>
                    <div className="flex gap-1 ml-auto">
                      {item.tags.slice(0, 1).map((t) => (
                        <span key={t} className="text-primary/60 text-xs">{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20 text-muted-foreground font-golos">
              <Icon name="SearchX" size={40} className="mx-auto mb-3 opacity-30" />
              <p>Ничего не найдено по вашему запросу</p>
            </div>
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
          <div className="rounded-xl border border-border/60 bg-card p-4 animate-fade-in stagger-3">
            <h3 className="font-rajdhani font-bold text-base uppercase tracking-widest text-foreground mb-3 flex items-center gap-2">
              <Icon name="TrendingUp" size={14} className="text-primary" />
              Сейчас в тренде
            </h3>
            <div className="space-y-3">
              {NEWS.slice(0, 4).map((item, i) => (
                <div key={item.id} className="flex gap-3 cursor-pointer group">
                  <span className="font-rajdhani font-bold text-2xl text-border w-7 flex-shrink-0 leading-none">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-golos text-xs text-foreground/90 leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-golos flex items-center gap-1">
                      <Icon name="Eye" size={9} />{item.views}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-8 py-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground font-golos">
          <span className="font-rajdhani font-semibold tracking-widest uppercase">
            Game<span className="text-primary">Feed</span> © 2025
          </span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary transition-colors">О проекте</a>
            <a href="#" className="hover:text-primary transition-colors">RSS</a>
            <a href="#" className="hover:text-primary transition-colors">Реклама</a>
            <a href="#" className="hover:text-primary transition-colors">Контакты</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
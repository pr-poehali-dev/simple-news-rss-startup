import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import Icon from "@/components/ui/icon";
import { fetchNewsById, NewsDetail } from "@/lib/api";

function Skeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 bg-secondary/60 rounded w-3/4" />
      <div className="h-72 bg-secondary/60 rounded-xl" />
      <div className="space-y-2">
        <div className="h-4 bg-secondary/40 rounded w-full" />
        <div className="h-4 bg-secondary/40 rounded w-5/6" />
        <div className="h-4 bg-secondary/40 rounded w-4/6" />
      </div>
    </div>
  );
}

export default function NewsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<NewsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setNotFound(false);
    fetchNewsById(Number(id))
      .then((res) => {
        if (res.ok && res.item) {
          setItem(res.item);
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  // Форматируем дату
  const formatDate = (iso: string) => {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("ru-RU", {
        day: "numeric", month: "long", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen gradient-bg scanline">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/60 backdrop-blur-xl bg-background/80">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-primary transition-colors p-1"
          >
            <Icon name="ArrowLeft" size={18} />
          </button>
          <a href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-primary/20 border border-primary/50 flex items-center justify-center animate-pulse-glow">
              <Icon name="Zap" size={13} className="text-primary" />
            </div>
            <span className="font-rajdhani font-bold text-lg tracking-widest text-foreground uppercase">
              Game<span className="text-primary neon-text-glow">Feed</span>
            </span>
          </a>
          {item && (
            <span className="hidden sm:block text-muted-foreground text-sm font-golos truncate ml-2 max-w-xs">
              / {item.category}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading && <Skeleton />}

        {notFound && !loading && (
          <div className="text-center py-24">
            <Icon name="FileX" size={48} className="mx-auto mb-4 text-muted-foreground opacity-30" />
            <h2 className="font-rajdhani font-bold text-2xl mb-2">Новость не найдена</h2>
            <p className="text-muted-foreground font-golos mb-6">Возможно, она была удалена или ссылка неверна</p>
            <a href="/" className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-rajdhani font-semibold px-5 py-2 rounded-lg hover:bg-primary/90 transition-colors">
              <Icon name="Home" size={16} />
              На главную
            </a>
          </div>
        )}

        {item && !loading && (
          <article className="animate-fade-in">
            {/* Мета */}
            <div className="flex flex-wrap items-center gap-2 mb-4 text-sm font-golos">
              <Badge className="bg-primary/20 text-primary border-primary/40">{item.category}</Badge>
              {item.translated && (
                <span className="flex items-center gap-1 text-xs text-primary/70 border border-primary/30 px-2 py-0.5 rounded">
                  <Icon name="Languages" size={11} /> Переведено на русский
                </span>
              )}
              <span className="text-muted-foreground flex items-center gap-1">
                <Icon name="Clock" size={12} />
                {formatDate(item.published_at)}
              </span>
              {item.source && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Icon name="Rss" size={12} />
                  {item.source}
                </span>
              )}
            </div>

            {/* Заголовок */}
            <h1 className="font-rajdhani font-bold text-3xl sm:text-4xl leading-tight mb-3 text-foreground">
              {item.title}
            </h1>

            {/* Оригинальный заголовок */}
            {item.translated && item.title_original && item.title_original !== item.title && (
              <p className="text-muted-foreground/60 text-sm font-golos italic mb-5 border-l-2 border-border/50 pl-3">
                {item.title_original}
              </p>
            )}

            {/* Изображение */}
            {item.image && (
              <div className="rounded-xl overflow-hidden mb-6 border border-border/40">
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full max-h-[480px] object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                />
              </div>
            )}

            {/* Текст */}
            <div className="prose-custom mb-8">
              <p className="text-foreground/90 font-golos text-lg leading-relaxed">
                {item.excerpt}
              </p>
            </div>

            {/* Кнопка — читать на источнике */}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide px-6 py-3 rounded-lg hover:bg-primary/90 transition-all neon-glow-green mb-10"
            >
              <Icon name="ExternalLink" size={16} />
              Читать полную статью на {item.source || "источнике"}
            </a>

            {/* Разделитель */}
            <div className="border-t border-border/40 pt-6 mb-6">
              <p className="text-xs text-muted-foreground font-golos flex items-center gap-1">
                <Icon name="Info" size={11} />
                GameFeed показывает краткое описание. Полный текст — на сайте издания.
                {item.translated && " Перевод выполнен автоматически с помощью ИИ."}
              </p>
            </div>

            {/* Prev / Next */}
            <nav className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {item.prev ? (
                <a
                  href={`/news/${item.prev.id}`}
                  className="group flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 transition-all card-hover"
                >
                  <Icon name="ChevronLeft" size={18} className="text-muted-foreground group-hover:text-primary transition-colors mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-golos mb-1">Предыдущая</p>
                    <p className="font-golos font-medium text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {item.prev.title}
                    </p>
                  </div>
                </a>
              ) : <div />}

              {item.next ? (
                <a
                  href={`/news/${item.next.id}`}
                  className="group flex items-start gap-3 p-4 rounded-xl border border-border/60 bg-card hover:border-primary/40 transition-all card-hover text-right sm:flex-row-reverse"
                >
                  <Icon name="ChevronRight" size={18} className="text-muted-foreground group-hover:text-primary transition-colors mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-golos mb-1">Следующая</p>
                    <p className="font-golos font-medium text-sm text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {item.next.title}
                    </p>
                  </div>
                </a>
              ) : <div />}
            </nav>
          </article>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/40 mt-12 py-6">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground font-golos">
          <a href="/" className="font-rajdhani font-semibold tracking-widest uppercase hover:text-primary transition-colors">
            Game<span className="text-primary">Feed</span> © 2025
          </a>
          <div className="flex gap-4">
            <a href="/" className="hover:text-primary transition-colors">Лента</a>
            <a href="/admin" className="hover:text-primary transition-colors">Админ</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

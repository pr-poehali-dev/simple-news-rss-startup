import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import {
  getTranslatorSettings,
  saveTranslatorSettings,
  testTranslation,
  runTranslatorBatch,
  TranslatorSettings,
  TranslatorStyle,
} from "@/lib/api";

// ── Типы ────────────────────────────────────────────────────────────────────

interface ProviderInfo {
  id: string;
  label: string;
  desc: string;
  url: string;
  has_models: boolean;
}

interface PerProviderKeyInfo {
  masked: string;
  source: string;
  has_key: boolean;
}

// ── Иконки провайдеров ───────────────────────────────────────────────────────

const PROVIDER_ICONS: Record<string, string> = {
  openai: "Brain",
  deepl: "Languages",
  yandex: "Globe",
  google: "Search",
  custom: "Terminal",
};

const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"];
const MODEL_INFO: Record<string, { desc: string; speed: string; cost: string }> = {
  "gpt-4o-mini":    { desc: "Оптимальный выбор",  speed: "Быстрый", cost: "Дешёвый" },
  "gpt-4o":         { desc: "Лучшее качество",    speed: "Средний", cost: "Дороже" },
  "gpt-3.5-turbo":  { desc: "Базовый вариант",    speed: "Быстрый", cost: "Самый дешёвый" },
};

// ── Компонент ────────────────────────────────────────────────────────────────

export default function Translator() {
  const [settings, setSettings] = useState<TranslatorSettings & {
    provider: string; custom_endpoint: string; custom_model: string;
  }>({
    model: "gpt-4o-mini", style: "readable", batch_size: 10,
    auto_translate: true, custom_prompt: "", updated_at: null,
    provider: "openai", custom_endpoint: "", custom_model: "",
  });

  const [styles, setStyles] = useState<TranslatorStyle[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [stats, setStats] = useState({ translated: 0, remaining: 0, total: 0 });
  const [keyInfoMap, setKeyInfoMap] = useState<Record<string, PerProviderKeyInfo>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // Key form state per provider
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [keyShown, setKeyShown] = useState<Record<string, boolean>>({});
  const [keySaving, setKeySaving] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<Record<string, "idle" | "valid" | "invalid">>({});

  // Test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    original: { title: string; excerpt: string };
    translated: { title_ru: string; excerpt_ru: string };
    provider: string; tokens_used: number;
  } | null>(null);
  const [testError, setTestError] = useState("");

  // Run
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Array<{ text: string; type: "info" | "success" | "error" | "done" }>>([]);
  const [runStats, setRunStats] = useState<{ translated_total: number; remaining: number; tokens: number } | null>(null);
  const translateRunning = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const load = async () => {
    setLoading(true);
    const data = await getTranslatorSettings() as any; // eslint-disable-line
    if (data.ok) {
      setSettings(s => ({ ...s, ...data.settings }));
      setStyles(data.styles || []);
      setProviders(data.providers || []);
      setStats(data.stats || { translated: 0, remaining: 0, total: 0 });
      setKeyInfoMap(data.key_info || {});
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);

  const handleSave = async () => {
    setSaving(true);
    await saveTranslatorSettings(settings as TranslatorSettings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    showToast("Настройки сохранены");
  };

  const handleSaveKey = async (provider: string) => {
    const input = keyInputs[provider]?.trim() || "";
    if (!input) return;
    setKeySaving(provider);
    setKeyStatus(s => ({ ...s, [provider]: "idle" }));

    // Определяем поле БД по провайдеру
    const fieldMap: Record<string, string> = {
      openai: "api_key", deepl: "api_key_deepl",
      yandex: "api_key_yandex", google: "api_key_google", custom: "api_key",
    };
    const field = fieldMap[provider] || "api_key";
    const res = await saveApiKey(input) as any; // eslint-disable-line
    // saveApiKey шлёт {api_key: input} — нам нужен нужный field
    // используем прямой POST вместо saveApiKey
    const resp = await fetch("https://functions.poehali.dev/415b9f99-4909-4be2-9947-aaf085b8f90c", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: input, provider }),
    }).then(r => r.json()).catch(() => ({ ok: false })) as any; // eslint-disable-line

    setKeySaving(null);
    const valid = resp.key_valid;
    setKeyStatus(s => ({ ...s, [provider]: valid === true ? "valid" : valid === false ? "invalid" : "idle" }));
    setKeyInputs(s => ({ ...s, [provider]: "" }));
    setKeyInfoMap(m => ({
      ...m,
      [provider]: { masked: resp.masked || "", source: "db", has_key: !!resp.masked },
    }));
    if (valid === false) {
      showToast("Ключ сохранён, но не прошёл проверку — проверьте правильность", false);
    } else {
      showToast(`Ключ для ${providers.find(p => p.id === provider)?.label || provider} сохранён!`);
    }
  };

  const handleDeleteKey = async (provider: string) => {
    const fieldMap: Record<string, string> = {
      openai: "api_key", deepl: "api_key_deepl",
      yandex: "api_key_yandex", google: "api_key_google", custom: "api_key",
    };
    const field = fieldMap[provider] || "api_key";
    await fetch("https://functions.poehali.dev/415b9f99-4909-4be2-9947-aaf085b8f90c", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: "" }),
    });
    setKeyInfoMap(m => ({ ...m, [provider]: { masked: "", source: "none", has_key: false } }));
    setKeyStatus(s => ({ ...s, [provider]: "idle" }));
    showToast("Ключ удалён");
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError("");
    const res = await testTranslation() as any; // eslint-disable-line
    setTesting(false);
    if (res.ok && res.original && res.translated) {
      setTestResult({ original: res.original, translated: res.translated, provider: res.provider || settings.provider, tokens_used: res.tokens_used || 0 });
    } else {
      setTestError(res.error || "Неизвестная ошибка");
    }
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    translateRunning.current = true;
    setLog([{ text: "Запускаем перевод...", type: "info" }]);
    setRunStats(null);
    let totalTokens = 0;

    while (translateRunning.current) {
      const res = await runTranslatorBatch(settings.batch_size);
      totalTokens += res.tokens_used || 0;
      if (!res.ok) {
        setLog(prev => [...prev, { text: `Ошибка: ${res.error}`, type: "error" }]);
        break;
      }
      setLog(prev => [...prev, { text: `✓ ${res.translated_now} статей  •  осталось ${res.remaining}  •  ~${totalTokens} токенов`, type: "success" }]);
      setRunStats({ translated_total: res.translated_total, remaining: res.remaining, tokens: totalTokens });
      setStats(prev => ({ ...prev, translated: res.translated_total, remaining: res.remaining }));
      if (res.finished) { setLog(prev => [...prev, { text: "Все статьи переведены!", type: "done" }]); break; }
      await new Promise(r => setTimeout(r, 600));
    }
    translateRunning.current = false;
    setRunning(false);
  };

  const progress = stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0;
  const activeKeyInfo = keyInfoMap[settings.provider];
  const hasActiveKey = activeKeyInfo?.has_key;

  return (
    <div className="min-h-screen gradient-bg">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg font-golos text-sm animate-fade-in flex items-center gap-2 ${toast.ok ? "bg-primary text-primary-foreground" : "bg-destructive text-white"}`}>
          <Icon name={toast.ok ? "CheckCircle" : "AlertCircle"} size={14} />
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur-xl bg-background/80 sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <a href="/admin" className="text-muted-foreground hover:text-primary transition-colors p-1">
            <Icon name="ArrowLeft" size={18} />
          </a>
          <div className="w-7 h-7 rounded bg-primary/20 border border-primary/50 flex items-center justify-center">
            <Icon name="Languages" size={14} className="text-primary" />
          </div>
          <span className="font-rajdhani font-bold text-lg tracking-widest uppercase">
            Game<span className="text-primary">Feed</span>
            <span className="text-muted-foreground text-sm ml-2 font-golos normal-case tracking-normal">/ Переводчик</span>
          </span>
          <div className="ml-auto">
            {hasActiveKey ? (
              <span className="text-xs text-primary font-golos flex items-center gap-1 border border-primary/30 px-2 py-1 rounded">
                <Icon name="CheckCircle" size={12} />
                {providers.find(p => p.id === settings.provider)?.label} · {activeKeyInfo.masked}
              </span>
            ) : (
              <span className="text-xs text-destructive font-golos flex items-center gap-1 border border-destructive/30 px-2 py-1 rounded">
                <Icon name="AlertTriangle" size={12} /> Нет ключа
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Статистика */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Всего статей", value: stats.total, icon: "Newspaper" },
            { label: "Переведено", value: stats.translated, icon: "CheckCircle" },
            { label: "Ожидают", value: stats.remaining, icon: "Clock" },
          ].map(s => (
            <div key={s.label} className="rounded-xl border border-border/60 bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon name={s.icon as never} size={13} className="text-primary" />
                <span className="text-xs text-muted-foreground font-golos">{s.label}</span>
              </div>
              <p className="font-rajdhani font-bold text-2xl">{loading ? "…" : s.value}</p>
            </div>
          ))}
        </div>

        {/* Прогресс */}
        {stats.total > 0 && (
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4">
            <div className="flex justify-between text-xs text-muted-foreground font-golos mb-2">
              <span>Прогресс перевода</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* ── Выбор провайдера ── */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2 mb-4">
            <Icon name="Shuffle" size={15} className="text-primary" />
            Провайдер перевода
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {providers.map(p => {
              const info = keyInfoMap[p.id];
              const isActive = settings.provider === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSettings(s => ({ ...s, provider: p.id }))}
                  className={`relative flex flex-col gap-1.5 p-4 rounded-xl border text-left transition-all ${
                    isActive
                      ? "border-primary bg-primary/10"
                      : "border-border/50 hover:border-border bg-secondary/20"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon name={PROVIDER_ICONS[p.id] as never} size={16} className={isActive ? "text-primary" : "text-muted-foreground"} />
                      <span className={`font-rajdhani font-bold text-base ${isActive ? "text-foreground" : "text-foreground/80"}`}>{p.label}</span>
                    </div>
                    {info?.has_key && (
                      <span className="text-xs text-primary bg-primary/15 px-1.5 py-0.5 rounded font-golos">
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-golos leading-relaxed">{p.desc}</p>
                  {info?.has_key && (
                    <p className="text-xs text-primary/60 font-mono">{info.masked}</p>
                  )}
                  {isActive && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Ключ для выбранного провайдера ── */}
        <div className={`rounded-xl border bg-card p-5 ${hasActiveKey ? "border-border/60" : "border-primary/30"}`}>
          <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2 mb-1">
            <Icon name="KeyRound" size={15} className="text-primary" />
            API ключ — {providers.find(p => p.id === settings.provider)?.label}
          </h2>

          {/* Ссылка где взять ключ */}
          {providers.find(p => p.id === settings.provider)?.url && (
            <p className="text-xs text-muted-foreground font-golos mb-4">
              Получить ключ:{" "}
              <a href={providers.find(p => p.id === settings.provider)?.url} target="_blank" rel="noopener noreferrer"
                className="text-primary underline">
                {providers.find(p => p.id === settings.provider)?.url}
              </a>
            </p>
          )}

          {/* Статус текущего ключа */}
          {hasActiveKey && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
              <Icon name="CheckCircle" size={16} className="text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-golos text-foreground font-medium">Ключ подключён</p>
                <p className="text-xs font-mono text-muted-foreground">
                  {activeKeyInfo?.source === "env" ? "Переменная окружения (OPENAI_API_KEY)" : activeKeyInfo?.masked}
                </p>
              </div>
              {activeKeyInfo?.source !== "env" && (
                <Button size="sm" variant="ghost" onClick={() => handleDeleteKey(settings.provider)}
                  className="text-destructive hover:bg-destructive/10 h-8 px-3 text-xs font-golos flex-shrink-0">
                  <Icon name="Trash2" size={12} className="mr-1" /> Удалить
                </Button>
              )}
            </div>
          )}

          {!hasActiveKey && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-secondary/40 border border-border/40 mb-4 text-xs text-muted-foreground font-golos">
              <Icon name="Info" size={13} className="flex-shrink-0 mt-0.5" />
              Ключ не установлен. Без него перевод через {providers.find(p => p.id === settings.provider)?.label} недоступен.
            </div>
          )}

          {/* Custom endpoint */}
          {settings.provider === "custom" && (
            <div className="mb-3 space-y-2">
              <Input
                placeholder="Endpoint URL (напр. http://localhost:11434 для Ollama)"
                value={settings.custom_endpoint}
                onChange={e => setSettings(s => ({ ...s, custom_endpoint: e.target.value }))}
                className="bg-secondary/60 border-border/60 font-mono text-sm h-9"
              />
              <Input
                placeholder="Название модели (напр. llama3, mistral, qwen2...)"
                value={settings.custom_model}
                onChange={e => setSettings(s => ({ ...s, custom_model: e.target.value }))}
                className="bg-secondary/60 border-border/60 font-mono text-sm h-9"
              />
            </div>
          )}

          {/* Ввод ключа */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={keyShown[settings.provider] ? "text" : "password"}
                placeholder={hasActiveKey ? "Введите новый ключ для замены..." : "Вставьте API ключ..."}
                value={keyInputs[settings.provider] || ""}
                onChange={e => { setKeyInputs(s => ({ ...s, [settings.provider]: e.target.value })); setKeyStatus(st => ({ ...st, [settings.provider]: "idle" })); }}
                className="bg-secondary/60 border-border/60 font-mono text-sm h-10 pr-10"
              />
              <button onClick={() => setKeyShown(s => ({ ...s, [settings.provider]: !s[settings.provider] }))}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                <Icon name={keyShown[settings.provider] ? "EyeOff" : "Eye"} size={15} />
              </button>
            </div>
            <Button
              onClick={() => handleSaveKey(settings.provider)}
              disabled={keySaving === settings.provider || !keyInputs[settings.provider]?.trim()}
              className="bg-primary text-primary-foreground font-rajdhani font-semibold h-10 px-5 gap-2 flex-shrink-0"
            >
              <Icon name={keySaving === settings.provider ? "Loader" : "Save"} size={14} className={keySaving === settings.provider ? "animate-spin" : ""} />
              {keySaving === settings.provider ? "Проверяем..." : "Сохранить"}
            </Button>
          </div>

          {keyStatus[settings.provider] === "valid" && (
            <p className="mt-2 text-xs text-primary font-golos flex items-center gap-1">
              <Icon name="CheckCircle" size={12} /> Ключ проверен и работает
            </p>
          )}
          {keyStatus[settings.provider] === "invalid" && (
            <p className="mt-2 text-xs text-destructive font-golos flex items-center gap-1">
              <Icon name="AlertCircle" size={12} /> Ключ сохранён, но проверка не прошла — проверьте правильность
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* ── Настройки ── */}
          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-5">
            <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2">
              <Icon name="Settings" size={15} className="text-primary" />
              Настройки
            </h2>

            {/* Модель (только для OpenAI/custom) */}
            {(settings.provider === "openai") && (
              <div>
                <p className="text-xs text-muted-foreground font-golos mb-2 uppercase tracking-wider">Модель OpenAI</p>
                <div className="space-y-2">
                  {OPENAI_MODELS.map(m => {
                    const info = MODEL_INFO[m];
                    return (
                      <button key={m} onClick={() => setSettings(s => ({ ...s, model: m }))}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                          settings.model === m ? "border-primary bg-primary/10" : "border-border/50 hover:border-border text-muted-foreground"
                        }`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${settings.model === m ? "border-primary bg-primary" : "border-border"}`} />
                        <div className="flex-1">
                          <p className="font-golos font-medium text-sm">{m}</p>
                          <p className="text-xs text-muted-foreground font-golos">{info.desc}</p>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <span className="text-xs bg-secondary px-1.5 py-0.5 rounded font-golos text-muted-foreground">{info.speed}</span>
                          <span className="text-xs bg-secondary px-1.5 py-0.5 rounded font-golos text-muted-foreground">{info.cost}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Стиль (только для OpenAI / custom — у других нет промпта) */}
            {["openai", "custom"].includes(settings.provider) && (
              <div>
                <p className="text-xs text-muted-foreground font-golos mb-2 uppercase tracking-wider">Стиль перевода</p>
                <div className="space-y-2">
                  {styles.map(s => (
                    <button key={s.id} onClick={() => setSettings(prev => ({ ...prev, style: s.id }))}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                        settings.style === s.id ? "border-primary bg-primary/10" : "border-border/50 hover:border-border text-muted-foreground"
                      }`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${settings.style === s.id ? "border-primary bg-primary" : "border-border"}`} />
                      <div>
                        <p className="font-golos font-medium text-sm">{s.label}</p>
                        <p className="text-xs text-muted-foreground font-golos">{s.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {settings.style === "custom" && (
                  <textarea value={settings.custom_prompt}
                    onChange={e => setSettings(s => ({ ...s, custom_prompt: e.target.value }))}
                    placeholder="Инструкция для переводчика..."
                    rows={4}
                    className="mt-2 w-full bg-secondary/60 border border-border/60 rounded-lg px-3 py-2 text-sm font-golos text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none"
                  />
                )}
              </div>
            )}

            {/* Размер батча */}
            <div>
              <p className="text-xs text-muted-foreground font-golos mb-2 uppercase tracking-wider">
                Статей за запрос: <span className="text-primary font-medium">{settings.batch_size}</span>
              </p>
              <input type="range" min={1} max={20} value={settings.batch_size}
                onChange={e => setSettings(s => ({ ...s, batch_size: Number(e.target.value) }))}
                className="w-full accent-primary" />
              <div className="flex justify-between text-xs text-muted-foreground font-golos mt-1">
                <span>1 — медленнее</span><span>20 — быстрее</span>
              </div>
            </div>

            {/* Авто-перевод */}
            <div className="flex items-center justify-between py-2 border-t border-border/40">
              <div>
                <p className="font-golos font-medium text-sm text-foreground">Автоперевод при RSS-синхронизации</p>
                <p className="text-xs text-muted-foreground font-golos">Переводить новые статьи автоматически</p>
              </div>
              <button onClick={() => setSettings(s => ({ ...s, auto_translate: !s.auto_translate }))}
                className={`relative w-11 h-6 rounded-full border transition-all flex-shrink-0 ${settings.auto_translate ? "bg-primary/30 border-primary" : "bg-secondary border-border/60"}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${settings.auto_translate ? "left-5 bg-primary" : "left-0.5 bg-muted-foreground"}`} />
              </button>
            </div>

            <Button onClick={handleSave} disabled={saving}
              className="w-full bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide h-10 gap-2">
              <Icon name={saved ? "CheckCircle" : saving ? "Loader" : "Save"} size={15} className={saving ? "animate-spin" : ""} />
              {saved ? "Сохранено!" : saving ? "Сохраняем..." : "Сохранить настройки"}
            </Button>
          </div>

          {/* ── Тест + Запуск ── */}
          <div className="space-y-5">
            {/* Тест */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2 mb-3">
                <Icon name="FlaskConical" size={15} className="text-primary" />
                Тест перевода
              </h2>
              <p className="text-xs text-muted-foreground font-golos mb-3">Переводит одну случайную статью без сохранения в БД</p>
              <Button onClick={handleTest} disabled={testing || !hasActiveKey} variant="outline"
                className="w-full border-primary/40 text-primary hover:bg-primary/10 font-rajdhani font-semibold h-9 gap-2">
                <Icon name={testing ? "Loader" : "Play"} size={14} className={testing ? "animate-spin" : ""} />
                {testing ? "Переводим..." : "Запустить тест"}
              </Button>

              {testError && (
                <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs text-destructive font-golos flex items-start gap-2">
                  <Icon name="AlertCircle" size={13} className="flex-shrink-0 mt-0.5" />
                  {testError}
                </div>
              )}

              {testResult && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground font-golos">
                    <span>Провайдер: <span className="text-primary">{providers.find(p => p.id === testResult.provider)?.label || testResult.provider}</span></span>
                    <span>~{testResult.tokens_used} токенов</span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border/40">
                    <p className="text-xs text-muted-foreground font-golos mb-1 uppercase tracking-wider">Оригинал</p>
                    <p className="font-golos font-medium text-sm mb-1">{testResult.original.title}</p>
                    <p className="font-golos text-xs text-muted-foreground line-clamp-2">{testResult.original.excerpt}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/30">
                    <p className="text-xs text-primary font-golos mb-1 uppercase tracking-wider flex items-center gap-1">
                      <Icon name="Languages" size={10} /> Перевод
                    </p>
                    <p className="font-golos font-medium text-sm mb-1">{testResult.translated.title_ru}</p>
                    <p className="font-golos text-xs text-foreground/70 line-clamp-3">{testResult.translated.excerpt_ru}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Запуск */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2 mb-3">
                <Icon name="Zap" size={15} className="text-primary" />
                Перевести все статьи
              </h2>
              {stats.remaining === 0 ? (
                <div className="flex items-center gap-2 text-primary font-golos text-sm py-2 mb-3">
                  <Icon name="CheckCircle" size={16} /> Все статьи переведены
                </div>
              ) : (
                <p className="text-sm text-muted-foreground font-golos mb-3">
                  Осталось: <span className="text-foreground font-medium">{stats.remaining}</span> статей
                </p>
              )}

              <div className="flex gap-2">
                {running ? (
                  <Button onClick={() => { translateRunning.current = false; setRunning(false); setLog(p => [...p, { text: "— Остановлено", type: "info" }]); }}
                    variant="outline" className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 font-rajdhani font-semibold h-9 gap-2">
                    <Icon name="Square" size={13} /> Остановить
                  </Button>
                ) : (
                  <Button onClick={handleRun} disabled={!hasActiveKey || stats.remaining === 0}
                    className="flex-1 bg-primary text-primary-foreground font-rajdhani font-semibold h-9 gap-2">
                    <Icon name="Play" size={14} />
                    {stats.remaining === 0 ? "Всё переведено" : `Перевести (${stats.remaining})`}
                  </Button>
                )}
              </div>

              {log.length > 0 && (
                <div ref={logRef} className="mt-3 max-h-44 overflow-y-auto rounded-lg bg-secondary/30 p-3 space-y-1 font-mono text-xs">
                  {log.map((e, i) => (
                    <p key={i} className={
                      e.type === "success" ? "text-primary" :
                      e.type === "error" ? "text-destructive" :
                      e.type === "done" ? "text-primary font-bold" : "text-muted-foreground"
                    }>{e.text}</p>
                  ))}
                  {running && <p className="text-primary/60 flex items-center gap-1"><Icon name="Loader" size={10} className="animate-spin" /> обработка...</p>}
                </div>
              )}

              {runStats && (
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Переведено", value: runStats.translated_total },
                    { label: "Осталось", value: runStats.remaining },
                    { label: "Токенов", value: runStats.tokens },
                  ].map(s => (
                    <div key={s.label} className="bg-secondary/40 rounded-lg p-2">
                      <p className="font-rajdhani font-bold text-lg">{s.value}</p>
                      <p className="text-xs text-muted-foreground font-golos">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Icon from "@/components/ui/icon";
import {
  getTranslatorSettings,
  saveTranslatorSettings,
  saveApiKey,
  testTranslation,
  runTranslatorBatch,
  TranslatorSettings,
  TranslatorStyle,
  KeyInfo,
} from "@/lib/api";

const MODEL_INFO: Record<string, { desc: string; speed: string; cost: string }> = {
  "gpt-4o-mini": { desc: "Оптимальный выбор", speed: "Быстрый", cost: "Дешёвый" },
  "gpt-4o":      { desc: "Лучшее качество", speed: "Средний", cost: "Дороже" },
  "gpt-3.5-turbo": { desc: "Базовый вариант", speed: "Быстрый", cost: "Самый дешёвый" },
};

export default function Translator() {
  const [settings, setSettings] = useState<TranslatorSettings>({
    model: "gpt-4o-mini", style: "readable", batch_size: 10,
    auto_translate: true, custom_prompt: "", updated_at: null,
  });
  const [styles, setStyles] = useState<TranslatorStyle[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [stats, setStats] = useState({ translated: 0, remaining: 0, total: 0 });
  const [keyInfo, setKeyInfo] = useState<KeyInfo>({ masked: "", source: "none", has_key: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState("");

  // API Key form
  const [keyInput, setKeyInput] = useState("");
  const [keyShown, setKeyShown] = useState(false);
  const [keySaving, setKeySaving] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"idle" | "valid" | "invalid">("idle");

  // Test
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ original: { title: string; excerpt: string }; translated: { title_ru: string; excerpt_ru: string }; model: string; tokens_used: number } | null>(null);
  const [testError, setTestError] = useState("");

  // Translation run
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<Array<{ text: string; type: "info" | "success" | "error" | "done" }>>([]);
  const [runStats, setRunStats] = useState<{ translated_total: number; remaining: number; tokens: number } | null>(null);
  const translateRunning = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const load = async () => {
    setLoading(true);
    const data = await getTranslatorSettings();
    if (data.ok) {
      setSettings(data.settings);
      setStyles(data.styles);
      setModels(data.models);
      setStats(data.stats);
      setKeyInfo(data.key_info);
    }
    setLoading(false);
  };

  const handleSaveKey = async () => {
    setKeySaving(true);
    setKeyStatus("idle");
    const res = await saveApiKey(keyInput.trim());
    setKeySaving(false);
    if (res.ok) {
      setKeyInput("");
      setKeyStatus(res.key_valid === true ? "valid" : res.key_valid === false ? "invalid" : "idle");
      setKeyInfo(prev => ({
        ...prev,
        masked: res.masked,
        source: res.masked ? "db" : "none",
        has_key: !!res.masked,
      }));
      showToast(res.key_valid === false ? "Ключ сохранён, но не прошёл проверку OpenAI" : "API ключ сохранён и проверен!");
      load();
    }
  };

  const handleDeleteKey = async () => {
    setKeySaving(true);
    await saveApiKey("");
    setKeySaving(false);
    setKeyInfo({ masked: "", source: "none", has_key: false });
    setKeyStatus("idle");
    showToast("API ключ удалён из базы");
    load();
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const handleSave = async () => {
    setSaving(true);
    await saveTranslatorSettings(settings);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    showToast("Настройки сохранены");
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError("");
    const res = await testTranslation();
    setTesting(false);
    if (res.ok && res.original && res.translated) {
      setTestResult({ original: res.original, translated: res.translated, model: res.model || settings.model, tokens_used: res.tokens_used || 0 });
    } else {
      setTestError(res.error || "Неизвестная ошибка");
    }
  };

  const handleRun = async () => {
    if (running) return;
    setRunning(true);
    translateRunning.current = true;
    setLog([]);
    setRunStats(null);
    let totalTokens = 0;

    setLog([{ text: "Запускаем перевод...", type: "info" }]);

    while (translateRunning.current) {
      const res = await runTranslatorBatch(settings.batch_size);
      totalTokens += res.tokens_used || 0;

      if (!res.ok) {
        setLog(prev => [...prev, { text: `Ошибка: ${res.error}`, type: "error" }]);
        break;
      }

      setLog(prev => [...prev, {
        text: `✓ Переведено ${res.translated_now} статей  •  Осталось: ${res.remaining}  •  Токенов: ${totalTokens}`,
        type: "success",
      }]);

      setRunStats({ translated_total: res.translated_total, remaining: res.remaining, tokens: totalTokens });
      setStats(prev => ({ ...prev, translated: res.translated_total, remaining: res.remaining }));

      if (res.finished) {
        setLog(prev => [...prev, { text: "Все статьи переведены!", type: "done" }]);
        break;
      }

      await new Promise(r => setTimeout(r, 600));
    }

    translateRunning.current = false;
    setRunning(false);
  };

  const handleStop = () => {
    translateRunning.current = false;
    setRunning(false);
    setLog(prev => [...prev, { text: "— Остановлено вручную", type: "info" }]);
  };

  const progress = stats.total > 0 ? Math.round((stats.translated / stats.total) * 100) : 0;

  return (
    <div className="min-h-screen gradient-bg">
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg font-golos text-sm animate-fade-in flex items-center gap-2">
          <Icon name="CheckCircle" size={14} />{toast}
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
          <div>
            <span className="font-rajdhani font-bold text-lg tracking-widest uppercase">
              Game<span className="text-primary">Feed</span>
            </span>
            <span className="text-muted-foreground text-sm ml-2 font-golos">/ Переводчик</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {!keyInfo.has_key && (
              <span className="text-xs text-destructive font-golos flex items-center gap-1 border border-destructive/30 px-2 py-1 rounded">
                <Icon name="AlertTriangle" size={12} /> Нет API ключа
              </span>
            )}
            {keyInfo.has_key && (
              <span className="text-xs text-primary font-golos flex items-center gap-1 border border-primary/30 px-2 py-1 rounded">
                <Icon name="CheckCircle" size={12} />
                {keyInfo.source === "env" ? "Ключ из окружения" : `Ключ: ${keyInfo.masked}`}
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Всего статей", value: stats.total, icon: "Newspaper" },
            { label: "Переведено", value: stats.translated, icon: "CheckCircle" },
            { label: "Ожидают перевода", value: stats.remaining, icon: "Clock" },
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

        {/* Progress */}
        {stats.total > 0 && (
          <div className="rounded-xl border border-border/60 bg-card px-5 py-4">
            <div className="flex justify-between text-xs text-muted-foreground font-golos mb-2">
              <span>Прогресс перевода</span>
              <span>{progress}% переведено</span>
            </div>
            <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* API Key block */}
        <div className={`rounded-xl border bg-card p-5 ${keyInfo.has_key ? "border-border/60" : "border-primary/40"}`}>
          <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2 mb-4">
            <Icon name="KeyRound" size={15} className="text-primary" />
            API ключ OpenAI
            {keyInfo.has_key && keyInfo.source === "env" && (
              <span className="text-xs font-golos normal-case tracking-normal text-muted-foreground border border-border/50 px-2 py-0.5 rounded ml-1">из окружения</span>
            )}
          </h2>

          {keyInfo.has_key && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
              <Icon name="CheckCircle" size={16} className="text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-golos text-foreground font-medium">Ключ подключён</p>
                <p className="text-xs text-muted-foreground font-golos font-mono">
                  {keyInfo.source === "env" ? "Установлен через переменную окружения (OPENAI_API_KEY)" : keyInfo.masked}
                </p>
              </div>
              {keyInfo.source === "db" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDeleteKey}
                  disabled={keySaving}
                  className="text-destructive hover:bg-destructive/10 h-8 px-3 text-xs font-golos flex-shrink-0"
                >
                  <Icon name="Trash2" size={12} className="mr-1" />
                  Удалить
                </Button>
              )}
            </div>
          )}

          {!keyInfo.has_key && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20 mb-4 text-xs text-muted-foreground font-golos">
              <Icon name="Info" size={13} className="flex-shrink-0 mt-0.5 text-destructive/70" />
              <span>Без ключа перевод недоступен. Получить ключ можно на <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">platform.openai.com</a> — раздел API Keys.</span>
            </div>
          )}

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={keyShown ? "text" : "password"}
                placeholder={keyInfo.has_key ? "Введите новый ключ для замены..." : "sk-..."}
                value={keyInput}
                onChange={e => { setKeyInput(e.target.value); setKeyStatus("idle"); }}
                className="bg-secondary/60 border-border/60 font-mono text-sm h-10 pr-10"
              />
              <button
                onClick={() => setKeyShown(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <Icon name={keyShown ? "EyeOff" : "Eye"} size={15} />
              </button>
            </div>
            <Button
              onClick={handleSaveKey}
              disabled={keySaving || !keyInput.trim()}
              className="bg-primary text-primary-foreground font-rajdhani font-semibold h-10 px-5 gap-2 flex-shrink-0"
            >
              <Icon name={keySaving ? "Loader" : "Save"} size={14} className={keySaving ? "animate-spin" : ""} />
              {keySaving ? "Проверяем..." : "Сохранить"}
            </Button>
          </div>

          {keyStatus === "valid" && (
            <p className="mt-2 text-xs text-primary font-golos flex items-center gap-1">
              <Icon name="CheckCircle" size={12} /> Ключ проверен и работает
            </p>
          )}
          {keyStatus === "invalid" && (
            <p className="mt-2 text-xs text-destructive font-golos flex items-center gap-1">
              <Icon name="AlertCircle" size={12} /> Ключ сохранён, но OpenAI вернул ошибку — проверьте правильность
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Настройки */}
          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-5">
            <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2">
              <Icon name="Settings" size={15} className="text-primary" />
              Настройки переводчика
            </h2>

            {/* Модель */}
            <div>
              <p className="text-xs text-muted-foreground font-golos mb-2 uppercase tracking-wider">Модель OpenAI</p>
              <div className="space-y-2">
                {models.map(m => {
                  const info = MODEL_INFO[m] || { desc: "", speed: "", cost: "" };
                  return (
                    <button
                      key={m}
                      onClick={() => setSettings(s => ({ ...s, model: m }))}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                        settings.model === m
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border/50 text-muted-foreground hover:border-border"
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${settings.model === m ? "border-primary bg-primary" : "border-border"}`} />
                      <div className="flex-1 min-w-0">
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

            {/* Стиль */}
            <div>
              <p className="text-xs text-muted-foreground font-golos mb-2 uppercase tracking-wider">Стиль перевода</p>
              <div className="space-y-2">
                {styles.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSettings(prev => ({ ...prev, style: s.id }))}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                      settings.style === s.id
                        ? "border-primary bg-primary/10"
                        : "border-border/50 text-muted-foreground hover:border-border"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5 ${settings.style === s.id ? "border-primary bg-primary" : "border-border"}`} />
                    <div>
                      <p className={`font-golos font-medium text-sm ${settings.style === s.id ? "text-foreground" : ""}`}>{s.label}</p>
                      <p className="text-xs text-muted-foreground font-golos">{s.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {settings.style === "custom" && (
                <textarea
                  value={settings.custom_prompt}
                  onChange={e => setSettings(s => ({ ...s, custom_prompt: e.target.value }))}
                  placeholder="Например: Переведи в стиле игровых обзоров для аудитории 18-25 лет. Используй молодёжный сленг..."
                  rows={4}
                  className="mt-2 w-full bg-secondary/60 border border-border/60 rounded-lg px-3 py-2 text-sm font-golos text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 resize-none"
                />
              )}
            </div>

            {/* Размер батча */}
            <div>
              <p className="text-xs text-muted-foreground font-golos mb-2 uppercase tracking-wider">
                Статей за один запрос: <span className="text-primary font-medium">{settings.batch_size}</span>
              </p>
              <input
                type="range" min={1} max={20} value={settings.batch_size}
                onChange={e => setSettings(s => ({ ...s, batch_size: Number(e.target.value) }))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs text-muted-foreground font-golos mt-1">
                <span>1 — медленнее, дешевле</span>
                <span>20 — быстрее, дороже</span>
              </div>
            </div>

            {/* Авто-перевод */}
            <div className="flex items-center justify-between py-2 border-t border-border/40">
              <div>
                <p className="font-golos font-medium text-sm text-foreground">Автоматический перевод</p>
                <p className="text-xs text-muted-foreground font-golos">Переводить новые статьи при синхронизации RSS</p>
              </div>
              <button
                onClick={() => setSettings(s => ({ ...s, auto_translate: !s.auto_translate }))}
                className={`relative w-11 h-6 rounded-full border transition-all flex-shrink-0 ${
                  settings.auto_translate ? "bg-primary/30 border-primary" : "bg-secondary border-border/60"
                }`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${
                  settings.auto_translate ? "left-5 bg-primary" : "left-0.5 bg-muted-foreground"
                }`} />
              </button>
            </div>

            {/* Кнопка сохранить */}
            <Button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-primary text-primary-foreground font-rajdhani font-semibold tracking-wide h-10 gap-2"
            >
              <Icon name={saved ? "CheckCircle" : saving ? "Loader" : "Save"} size={15} className={saving ? "animate-spin" : ""} />
              {saved ? "Сохранено!" : saving ? "Сохраняем..." : "Сохранить настройки"}
            </Button>
          </div>

          {/* Правая колонка — тест + запуск */}
          <div className="space-y-5">
            {/* Тест перевода */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2 mb-4">
                <Icon name="FlaskConical" size={15} className="text-primary" />
                Тест перевода
              </h2>
              <p className="text-xs text-muted-foreground font-golos mb-3">
                Переведёт одну случайную статью с текущими настройками — без сохранения в базу
              </p>
              <Button
                onClick={handleTest}
                disabled={testing || !keyInfo.has_key}
                variant="outline"
                className="w-full border-primary/40 text-primary hover:bg-primary/10 font-rajdhani font-semibold h-9 gap-2"
              >
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
                    <span>Модель: <span className="text-primary">{testResult.model}</span></span>
                    <span>Токенов: <span className="text-primary">{testResult.tokens_used}</span></span>
                  </div>
                  <div className="p-3 rounded-lg bg-secondary/40 border border-border/40">
                    <p className="text-xs text-muted-foreground font-golos mb-1 uppercase tracking-wider">Оригинал</p>
                    <p className="font-golos text-sm text-foreground/80 font-medium mb-1">{testResult.original.title}</p>
                    <p className="font-golos text-xs text-muted-foreground line-clamp-2">{testResult.original.excerpt}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/30">
                    <p className="text-xs text-primary font-golos mb-1 uppercase tracking-wider flex items-center gap-1">
                      <Icon name="Languages" size={10} /> Перевод
                    </p>
                    <p className="font-golos text-sm text-foreground font-medium mb-1">{testResult.translated.title_ru}</p>
                    <p className="font-golos text-xs text-foreground/70 line-clamp-3">{testResult.translated.excerpt_ru}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Запуск перевода */}
            <div className="rounded-xl border border-border/60 bg-card p-5">
              <h2 className="font-rajdhani font-bold text-lg uppercase tracking-widest flex items-center gap-2 mb-3">
                <Icon name="Zap" size={15} className="text-primary" />
                Перевести все статьи
              </h2>

              {stats.remaining === 0 ? (
                <div className="flex items-center gap-2 text-primary font-golos text-sm py-2">
                  <Icon name="CheckCircle" size={16} />
                  Все статьи уже переведены
                </div>
              ) : (
                <p className="text-sm text-muted-foreground font-golos mb-3">
                  Нужно перевести: <span className="text-foreground font-medium">{stats.remaining}</span> статей
                  {" "}≈ <span className="text-foreground font-medium">{Math.ceil(stats.remaining / settings.batch_size)}</span> запросов
                </p>
              )}

              <div className="flex gap-2">
                {running ? (
                  <Button onClick={handleStop} variant="outline" className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10 font-rajdhani font-semibold h-9 gap-2">
                    <Icon name="Square" size={13} /> Остановить
                  </Button>
                ) : (
                  <Button
                    onClick={handleRun}
                    disabled={!keyInfo.has_key || stats.remaining === 0}
                    className="flex-1 bg-primary text-primary-foreground font-rajdhani font-semibold h-9 gap-2"
                  >
                    <Icon name="Play" size={14} />
                    {stats.remaining === 0 ? "Всё переведено" : `Перевести (${stats.remaining})`}
                  </Button>
                )}
              </div>

              {/* Лог */}
              {log.length > 0 && (
                <div ref={logRef} className="mt-3 max-h-44 overflow-y-auto rounded-lg bg-secondary/30 p-3 space-y-1 font-mono text-xs">
                  {log.map((entry, i) => (
                    <p key={i} className={
                      entry.type === "success" ? "text-primary" :
                      entry.type === "error" ? "text-destructive" :
                      entry.type === "done" ? "text-primary font-bold" :
                      "text-muted-foreground"
                    }>
                      {entry.text}
                    </p>
                  ))}
                  {running && (
                    <p className="text-primary/60 flex items-center gap-1">
                      <Icon name="Loader" size={10} className="animate-spin" /> обработка...
                    </p>
                  )}
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
                      <p className="font-rajdhani font-bold text-lg text-foreground">{s.value}</p>
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
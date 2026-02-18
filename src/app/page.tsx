"use client";

import React, { useState, useEffect } from "react";
import { RefreshCw, Calendar, Clock, CheckCircle2, Activity, ShieldCheck } from "lucide-react";
import { translations } from "@/lib/translations";

interface SyncLog {
  id: string;
  type: 'create' | 'update' | 'delete' | 'info';
  message: string;
  details?: string;
  timestamp: string;
  trigger?: 'manual' | 'auto';
}

interface Surgery {
  id: string;
  name: string;
  date: string;
}

interface SyncStats {
  source: { name: string; futureEvents: number };
  target: { name: string; totalEvents: number };
  created: number;
  updated: number;
  deleted?: number;
}

interface SyncHistoryLog {
  id: string;
  timestamp: string;
  status: 'success' | 'error';
  message?: string;
  trigger: 'manual' | 'auto';
}

interface SyncResponse {
  success: boolean;
  timestamp: string;
  logs: SyncLog[];
  history: SyncHistoryLog[];
  upcomingSurgeries: Surgery[];
  stats: SyncStats;
  error?: string;
}

export default function Home() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [data, setData] = useState<SyncResponse | null>(null);
  const [lang, setLang] = useState<'en' | 'tr'>('en');
  const [nextSync, setNextSync] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>("");

  const t = translations[lang];

  const performSync = React.useCallback((trigger: 'manual' | 'auto' = 'manual') => {
    setIsSyncing(true);
    fetch(`/api/calendar/sync?trigger=${trigger}`, { method: 'POST' })
      .then(res => res.json())
      .then(d => {
        if (d.success) {
          setData(d);
          // Set next sync time to 15 minutes from now
          setNextSync(new Date(Date.now() + 15 * 60 * 1000));
        } else {
          console.error(d.error);
        }
      })
      .catch(console.error)
      .finally(() => setIsSyncing(false));
  }, [isSyncing]);

  useEffect(() => {
    // Initial Sync
    performSync('auto');

    // Auto-poll every 15 mins
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') performSync('auto');
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [performSync]);

  // Countdown Timer
  useEffect(() => {
    if (!nextSync) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = nextSync.getTime() - now;

      if (distance < 0) {
        setTimeLeft(lang === 'en' ? "Syncing..." : "Senkronize ediliyor...");
      } else {
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
        setTimeLeft(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [nextSync, lang]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return lang === 'en' ? "--:--" : "--:--";
    return new Date(dateStr).toLocaleTimeString(lang === 'en' ? 'en-US' : 'tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatFullDate = (dateStr: string) => {
    if (!dateStr) return t.waiting;
    return new Date(dateStr).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR');
  };



  return (
    <main className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-500/30">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-orange-900/20">
              <Calendar className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-xl tracking-tight text-slate-100">Kommo<span className="text-slate-500">Sync</span></h1>
            <span className="ml-4 text-xs text-slate-500 border-l border-slate-700 pl-4 py-1 hidden md:inline-block">
              Kommo-Medproper için, Ameliyat randevu takvim kopyası oluşturur.
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Language Switcher */}
            <div className="flex items-center bg-slate-800 rounded-lg p-1 border border-slate-700">
              <button
                onClick={() => setLang('tr')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${lang === 'tr' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span>🇹🇷</span> TR
              </button>
              <button
                onClick={() => setLang('en')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${lang === 'en' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
              >
                <span>🇬🇧</span> EN
              </button>
            </div>

            <button
              onClick={() => performSync('manual')}
              disabled={isSyncing}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all border ${isSyncing
                ? "bg-slate-800 border-slate-700 text-slate-400 cursor-wait"
                : "bg-amber-500 hover:bg-amber-400 text-slate-900 border-amber-400 shadow-lg shadow-amber-900/20 active:scale-95"}`}
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? t.syncing : t.syncNow}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Last Sync */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Clock className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <p className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">{t.lastSync}</p>
              <h2 className="text-2xl font-bold text-white">
                {formatDate(data?.timestamp || "")} <span className="text-sm text-slate-500 font-normal">(GMT +3)</span>
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-slate-600 font-medium">
                  {formatFullDate(data?.timestamp || "")}
                </p>
                {timeLeft && (
                  <span className="text-[10px] font-mono text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    -{timeLeft}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Source Calendar */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-blue-500/30 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-blue-500">
              <Calendar className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">{t.sourceCalendar}</p>
              </div>
              <h3 className="text-lg font-bold text-slate-200 truncate" title={data?.stats?.source?.name}>
                {data?.stats?.source?.name || t.loading}
              </h3>
              <p className="mt-2 text-3xl font-bold text-white">
                {data?.stats?.source?.futureEvents ?? "-"}
              </p>
              <p className="text-xs text-slate-600">{t.futureEvents}</p>
            </div>
          </div>

          {/* Target Calendar */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-emerald-500/30 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-emerald-500">
              <CheckCircle2 className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">{t.targetCalendar}</p>
              </div>
              <h3 className="text-lg font-bold text-slate-200 truncate" title={data?.stats?.target?.name}>
                {data?.stats?.target?.name || t.loading}
              </h3>
              <p className="mt-2 text-3xl font-bold text-white">
                {data?.stats?.target?.totalEvents ?? "-"}
              </p>
              <p className="text-xs text-slate-600">{t.totalCopies}</p>
            </div>
          </div>

        </div>

        {/* Main Content Grid: Logs & Upcoming Surgeries */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[600px]">

          {/* LOGS Section - Left (2 cols) */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col h-full overflow-hidden">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-between shrink-0">
              <span className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-slate-400" />
                {t.syncLogs}
              </span>
              <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">{t.last100}</span>
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {data?.logs && data.logs.length > 0 ? (
                data.logs.map((log: SyncLog) => (
                  <div key={log.id} className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/50 hover:border-slate-700 transition-colors">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {log.trigger === 'manual'
                          ? <span className="text-[10px] font-bold text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded border border-slate-600" title={t.manual}>M</span>
                          : <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700" title={t.auto}>A</span>
                        }
                        {log.type === 'create' && <span className="text-xs font-bold text-slate-900 bg-emerald-500 px-1.5 py-0.5 rounded">{t.logNew}</span>}
                        {log.type === 'update' && <span className="text-xs font-bold text-slate-900 bg-amber-500 px-1.5 py-0.5 rounded">{t.logUpdate}</span>}
                        {log.type === 'delete' && <span className="text-xs font-bold text-slate-900 bg-red-500 px-1.5 py-0.5 rounded">Silindi</span>}
                        <span className="text-sm font-semibold text-slate-300">{log.message}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString(lang === 'en' ? 'en-US' : 'tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {log.details && (
                      <p className="text-xs text-slate-500 ml-1 pl-2 border-l-2 border-slate-800">
                        {log.details}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                  <Activity className="w-12 h-12 mb-2 stroke-1" />
                  <p>{t.noLogs}</p>
                </div>
              )}
            </div>
          </div>

          {/* Sync History - Middle (1 col) */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-6 flex flex-col h-full overflow-hidden">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2 shrink-0">
              <RefreshCw className="w-5 h-5 text-slate-400" />
              {t.syncHistory}
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {data?.history && data.history.length > 0 ? (
                data.history.map((hist) => (
                  <div key={hist.id} className="p-3 bg-slate-950/30 rounded-lg border border-slate-800/50 hover:border-slate-700 transition-colors">
                    {/* Line 1: Time & Trigger */}
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${hist.status === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                        <span className="text-xs font-mono text-slate-400">
                          {new Date(hist.timestamp).toLocaleTimeString(lang === 'en' ? 'en-US' : 'tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <span className="text-[10px] bg-slate-800 text-slate-500 px-1 rounded">
                        {hist.trigger === 'manual' ? 'MAN' : 'AUTO'}
                      </span>
                    </div>
                    {/* Line 2: Status & Message */}
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${hist.status === 'success' ? 'text-slate-400' : 'text-red-400'}`}>
                        {hist.status === 'success' ? t.success : t.error}
                      </span>
                      {hist.message && (
                        <span className="text-[10px] text-slate-500 truncate ml-2 max-w-[140px]" title={hist.message}>
                          {hist.message.replace('Senkronizasyon başarılı. ', '').replace(/[()]/g, '')}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                  <p className="text-xs">Geçmiş yok</p>
                </div>
              )}
            </div>
          </div>

          {/* Planned Surgeries List - Right (1 col) */}
          <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col h-full overflow-hidden">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-3 shrink-0">
              <Calendar className="w-6 h-6 text-slate-400" />
              {t.upcomingSurgeriesTitle}
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
              {data?.upcomingSurgeries && data.upcomingSurgeries.length > 0 ? (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-900/95 backdrop-blur z-10">
                    <tr>
                      <th className="py-2 text-xs font-bold text-slate-500 uppercase tracking-wider w-24">{t.date}</th>
                      <th className="py-2 text-xs font-bold text-slate-500 uppercase tracking-wider">{t.patient}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {data.upcomingSurgeries.map((surgery: Surgery) => (
                      <tr key={surgery.id} className="group hover:bg-slate-800/20 transition-colors">
                        <td className="py-2.5 text-xs font-mono text-slate-400">
                          {new Date(surgery.date).toLocaleDateString(lang === 'en' ? 'en-US' : 'tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </td>
                        <td className="py-2.5 text-sm font-semibold text-slate-200 group-hover:text-amber-500 transition-colors">
                          {surgery.name}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                  <Calendar className="w-12 h-12 mb-2 stroke-1" />
                  <p>{t.loading}</p>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Sync Rules Section - Bottom, Smaller */}
        <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6">
          <h3 className="text-sm font-bold text-slate-400 mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            {t.syncRules}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-0.5">{t.ruleScope}</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">{t.ruleScopeDesc}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-0.5">{t.ruleFrequency}</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">{t.ruleFrequencyDesc}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-0.5">{t.ruleFiltering}</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">{t.ruleFilteringDesc}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-0.5">{t.rulePrivacy}</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">{t.rulePrivacyDesc}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-0.5">{t.ruleAppearance}</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">{t.ruleAppearanceDesc}</p>
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-0.5">{t.ruleDuplication}</h4>
              <p className="text-[10px] text-slate-500 leading-relaxed">{t.ruleDuplicationDesc}</p>
            </div>
          </div>
        </div>

      </div>

      {/* Log Modal */}


    </main>
  );
}

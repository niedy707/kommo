"use client";

import React, { useState, useEffect } from "react";
import { RefreshCw, Calendar, ArrowRight, GitBranch, ShieldCheck, Clock, CheckCircle2, Activity, ExternalLink } from "lucide-react";

export default function Home() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [data, setData] = useState<any>(null);

  const performSync = (trigger: 'manual' | 'auto' = 'manual') => {
    if (isSyncing) return;
    setIsSyncing(true);
    fetch(`/api/calendar/sync?trigger=${trigger}`, { method: 'POST' })
      .then(res => res.json())
      .then(d => {
        if (d.success) setData(d);
        else console.error(d.error);
      })
      .catch(console.error)
      .finally(() => setIsSyncing(false));
  };

  useEffect(() => {
    // Initial Sync
    performSync('auto');

    // Auto-poll every 15 mins
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') performSync('auto');
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

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
          </div>

          <button
            onClick={() => performSync('manual')}
            disabled={isSyncing}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition-all border ${isSyncing
              ? "bg-slate-800 border-slate-700 text-slate-400 cursor-wait"
              : "bg-amber-500 hover:bg-amber-400 text-slate-900 border-amber-400 shadow-lg shadow-amber-900/20 active:scale-95"}`}
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Senkronize Ediliyor..." : "Şimdi Senkronize Et"}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-8">

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* Last Sync */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-slate-700 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <Clock className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <p className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">Son Senkronizasyon</p>
              <h2 className="text-2xl font-bold text-white">
                {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : "--:--"}
              </h2>
              <p className="text-xs text-slate-600 font-medium mt-1">
                {data?.timestamp ? new Date(data.timestamp).toLocaleDateString('tr-TR') : "Bekleniyor..."}
              </p>
            </div>
          </div>

          {/* Synced Surgeries */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group hover:border-amber-500/30 transition-all">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-amber-500">
              <Activity className="w-24 h-24" />
            </div>
            <div className="relative z-10">
              <p className="text-amber-500/80 text-sm font-bold uppercase tracking-wider mb-1">Aktarılan Ameliyat</p>
              <h2 className="text-4xl font-black text-white">
                {data?.stats?.created !== undefined ? data.stats.created + data.stats.updated : "-"}
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Bu seansta işlenen
              </p>
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
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Kaynak Takvim</p>
              </div>
              <h3 className="text-lg font-bold text-slate-200 truncate" title={data?.stats?.source?.name}>
                {data?.stats?.source?.name || "Yükleniyor..."}
              </h3>
              <p className="mt-2 text-3xl font-bold text-white">
                {data?.stats?.source?.futureEvents ?? "-"}
              </p>
              <p className="text-xs text-slate-600">Gelecek Etkinlik (6 Ay)</p>
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
                <p className="text-slate-500 text-sm font-bold uppercase tracking-wider">Kopya Takvim</p>
              </div>
              <h3 className="text-lg font-bold text-slate-200 truncate" title={data?.stats?.target?.name}>
                {data?.stats?.target?.name || "Yükleniyor..."}
              </h3>
              <p className="mt-2 text-3xl font-bold text-white">
                {data?.stats?.target?.totalEvents ?? "-"}
              </p>
              <p className="text-xs text-slate-600">Toplam Kopya</p>
            </div>
          </div>

        </div>

        {/* Sync Rules and Logs Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* LOGS Section - Right Bottom */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col h-[500px]">
            <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-between">
              <span className="flex items-center gap-3">
                <Activity className="w-6 h-6 text-slate-400" />
                İşlem Geçmişi
              </span>
              <span className="text-xs font-mono text-slate-500 bg-slate-800 px-2 py-1 rounded">Son 100</span>
            </h3>

            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3">
              {data?.logs && data.logs.length > 0 ? (
                data.logs.map((log: any) => (
                  <div key={log.id} className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/50 hover:border-slate-700 transition-colors">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {log.trigger === 'manual'
                          ? <span className="text-[10px] font-bold text-slate-300 bg-slate-700 px-1.5 py-0.5 rounded border border-slate-600" title="Manuel Tetikleme">M</span>
                          : <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700" title="Otomatik Tetikleme">A</span>
                        }
                        {log.type === 'create' && <span className="text-xs font-bold text-slate-900 bg-emerald-500 px-1.5 py-0.5 rounded">YENİ</span>}
                        {log.type === 'update' && <span className="text-xs font-bold text-slate-900 bg-amber-500 px-1.5 py-0.5 rounded">GÜNCELLEME</span>}
                        <span className="text-sm font-semibold text-slate-300">{log.message}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono shrink-0">
                        {new Date(log.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
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
                  <p>Henüz kayıt bulunmuyor</p>
                </div>
              )}
            </div>
          </div>

          {/* Sync Rules Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 h-[500px] overflow-y-auto">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-slate-400" />
              Senkronizasyon Kuralları
            </h3>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-4">
                <RuleItem
                  title="Kapsam"
                  desc="Bugünden itibaren gelecek 6 aylık etkinlikler taranır."
                />
                <RuleItem
                  title="Sıklık"
                  desc="Her 15 dakikada bir otomatik kontrol sağlanır."
                />
              </div>

              <div className="space-y-4">
                <RuleItem
                  title="Filtreleme"
                  desc="Sadece 'Ameliyat' türündeki ve 'Blok' (izin, kongre) etkinlikleri aktarılır."
                />
                <RuleItem
                  title="Gizlilik"
                  desc="Ameliyat isimleri 'Surgery Ad Soyad' formatında maskelenir."
                />
              </div>

              <div className="space-y-4">
                <RuleItem
                  title="Görünüm"
                  desc="Ameliyat etkinlikleri hedef takvimde SARI renkle işaretlenir."
                />
                <RuleItem
                  title="Duplikasyon Kontrolü"
                  desc="Aynı isimli etkinliklerin saati değişse bile tekrar oluşturulmaz, mevcut kayıt güncellenir."
                />
              </div>
            </div>
          </div>

        </div>

        {/* Project Links */}
        <div className="flex justify-center pt-8">
          <a
            href="https://github.com/niedy707/kommo"
            target="_blank"
            className="flex items-center gap-3 px-6 py-3 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:border-slate-700 hover:text-white text-slate-400 transition-all group"
          >
            <GitBranch className="w-5 h-5 group-hover:text-amber-500 transition-colors" />
            <span className="font-mono text-sm">github.com/niedy707/kommo</span>
            <ExternalLink className="w-4 h-4 opacity-50" />
          </a>
        </div>

      </div>
    </main>
  );
}

const RuleItem = ({ title, desc }: { title: string, desc: string }) => (
  <div className="flex gap-4">
    <div className="w-1 h-full bg-slate-800 rounded-full shrink-0"></div>
    <div>
      <h4 className="text-slate-300 font-bold text-sm uppercase tracking-wide mb-1">{title}</h4>
      <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
    </div>
  </div>
);

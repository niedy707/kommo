"use client";

import React, { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function Home() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);

  // Auto-polling every 15 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        console.log("Auto-syncing calendar...");
        performSync();
      }
    }, 15 * 60 * 1000); // 15 minutes

    return () => clearInterval(interval);
  }, []);

  const performSync = () => {
    if (isSyncing) return;
    setIsSyncing(true);
    fetch('/api/calendar/sync', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        setLastSyncResult(data);
        if (data.success) {
          console.log("Sync success:", data);
        } else {
          console.error("Sync failed:", data.error);
        }
      })
      .catch(err => {
        console.error("Sync error:", err);
        setLastSyncResult({ success: false, error: err.message });
      })
      .finally(() => setIsSyncing(false));
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-950 text-white">
      <div className="z-10 max-w-5xl w-full items-center justify-center font-mono text-sm flex flex-col gap-8">
        <h1 className="text-4xl font-bold text-amber-500">Kommo Calendar Sync</h1>

        <div className="p-8 border border-slate-800 rounded-2xl bg-slate-900/50 flex flex-col gap-4 items-center">
          <p className="text-slate-400">Current Status: {isSyncing ? "Syncing..." : "Idle"}</p>

          <button
            onClick={performSync}
            disabled={isSyncing}
            className={`px-6 py-3 rounded-lg font-bold transition-all border flex items-center gap-3 ${isSyncing ? "bg-amber-500/20 border-amber-500 text-amber-500 cursor-wait" : "bg-blue-600 hover:bg-blue-500 text-white border-transparent"}`}
          >
            <RefreshCw className={`w-5 h-5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Now"}
          </button>

          {lastSyncResult && (
            <div className={`mt-4 p-4 rounded-lg w-full max-w-md ${lastSyncResult.success ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"}`}>
              {lastSyncResult.success ? (
                <div className="flex flex-col gap-1">
                  <span className="font-bold">Sync Successful!</span>
                  <span>Found: {lastSyncResult.stats?.foundTotal}</span>
                  <span>Created: {lastSyncResult.stats?.created}</span>
                  <span>Updated: {lastSyncResult.stats?.updated}</span>
                </div>
              ) : (
                <span>Error: {lastSyncResult.error}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Server, Heart, Activity, Clock, RefreshCw } from "lucide-react";

export default function WorkersPage() {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);

  const load = async () => {
    try { const d = await api.getWorkers(); setWorkers(d.workers); } catch (err) { console.error(err); }
    setLoading(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workers</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Monitor worker instances and their health</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workers.map((w) => {
          const isHealthy = w.status === "active" && (w.seconds_since_heartbeat || 0) < 120;
          return (
            <div key={w.id} className="glass-card p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    w.status === "active" ? "bg-emerald-500/10" : w.status === "draining" ? "bg-amber-500/10" : "bg-red-500/10"
                  }`}>
                    <Server className={`w-5 h-5 ${w.status === "active" ? "text-emerald-400" : w.status === "draining" ? "text-amber-400" : "text-red-400"}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{w.name}</h3>
                    <p className="text-xs text-[var(--color-muted)]">{w.hostname}:{w.pid}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${isHealthy ? "bg-emerald-500 animate-pulse-glow" : w.status === "draining" ? "bg-amber-500" : "bg-red-500"}`} />
                  <span className="text-xs font-medium">{w.status}</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-[var(--color-surface)] rounded-lg p-2">
                  <Activity className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
                  <p className="text-sm font-bold">{w.active_jobs}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">Active</p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-lg p-2">
                  <Heart className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
                  <p className="text-sm font-bold">{w.completed_jobs}</p>
                  <p className="text-[10px] text-[var(--color-muted)]">Done</p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-lg p-2">
                  <Clock className="w-3.5 h-3.5 text-blue-400 mx-auto mb-1" />
                  <p className="text-sm font-bold">{w.seconds_since_heartbeat || 0}s</p>
                  <p className="text-[10px] text-[var(--color-muted)]">Heartbeat</p>
                </div>
              </div>

              <div className="mt-3 text-xs text-[var(--color-muted)]">
                Concurrency: {w.concurrency} · Queues: {w.queues?.length || 0} · Registered: {new Date(w.registered_at).toLocaleString()}
              </div>
            </div>
          );
        })}
        {workers.length === 0 && <div className="glass-card p-8 text-center text-[var(--color-muted)] col-span-full">No workers registered yet. Start the backend to register a worker.</div>}
      </div>
    </div>
  );
}

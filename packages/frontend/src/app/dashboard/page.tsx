"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Activity, CheckCircle, Clock, AlertTriangle, Server, Layers, XCircle, TrendingUp } from "lucide-react";

interface DashboardStats {
  jobs: { total: number; queued: number; running: number; completed: number; failed: number; dead: number; created_last_hour: number; completed_last_hour: number };
  workers: { total: number; active: number; inactive: number };
  queues: { total: number; paused: number };
  dlq: { pending: number };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api.getDashboardStats();
        setStats(data);
      } catch (err) { console.error(err); }
      setLoading(false);
    };
    load();

    // SSE for live updates
    const es = api.createEventSource();
    if (es) {
      es.onmessage = (e) => {
        try {
          const update = JSON.parse(e.data);
          setStats(prev => prev ? { ...prev, jobs: { ...prev.jobs, ...update.jobs }, workers: { ...prev.workers, ...update.workers } } : prev);
        } catch {}
      };
      return () => es.close();
    }
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  const statCards = [
    { label: "Total Jobs", value: stats?.jobs.total || 0, icon: Activity, color: "from-blue-500 to-cyan-500" },
    { label: "Running", value: stats?.jobs.running || 0, icon: Clock, color: "from-amber-500 to-orange-500", pulse: true },
    { label: "Completed", value: stats?.jobs.completed || 0, icon: CheckCircle, color: "from-emerald-500 to-green-500" },
    { label: "Failed", value: stats?.jobs.failed || 0, icon: XCircle, color: "from-red-500 to-rose-500" },
    { label: "Active Workers", value: stats?.workers.active || 0, icon: Server, color: "from-violet-500 to-purple-500" },
    { label: "Queues", value: stats?.queues.total || 0, icon: Layers, color: "from-indigo-500 to-blue-500" },
    { label: "DLQ Pending", value: stats?.dlq.pending || 0, icon: AlertTriangle, color: "from-rose-500 to-pink-500" },
    { label: "Jobs/Hour", value: stats?.jobs.completed_last_hour || 0, icon: TrendingUp, color: "from-teal-500 to-emerald-500" },
  ];

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">System overview and real-time metrics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${card.color} flex items-center justify-center ${card.pulse ? "animate-pulse-glow" : ""}`}>
                <card.icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs text-[var(--color-muted)]">{card.label}</span>
            </div>
            <p className="text-2xl font-bold">{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Job Status Distribution */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold mb-4">Job Status Distribution</h2>
        <div className="flex gap-2 h-4 rounded-full overflow-hidden bg-[var(--color-surface)]">
          {stats && stats.jobs.total > 0 && (
            <>
              <div className="bg-slate-500 transition-all" style={{ width: `${(stats.jobs.queued / stats.jobs.total) * 100}%` }} title={`Queued: ${stats.jobs.queued}`} />
              <div className="bg-amber-500 transition-all" style={{ width: `${(stats.jobs.running / stats.jobs.total) * 100}%` }} title={`Running: ${stats.jobs.running}`} />
              <div className="bg-emerald-500 transition-all" style={{ width: `${(stats.jobs.completed / stats.jobs.total) * 100}%` }} title={`Completed: ${stats.jobs.completed}`} />
              <div className="bg-red-500 transition-all" style={{ width: `${(stats.jobs.failed / stats.jobs.total) * 100}%` }} title={`Failed: ${stats.jobs.failed}`} />
              <div className="bg-rose-700 transition-all" style={{ width: `${(stats.jobs.dead / stats.jobs.total) * 100}%` }} title={`Dead: ${stats.jobs.dead}`} />
            </>
          )}
        </div>
        <div className="flex gap-4 mt-3 flex-wrap">
          {[{ l: "Queued", c: "bg-slate-500", v: stats?.jobs.queued }, { l: "Running", c: "bg-amber-500", v: stats?.jobs.running }, { l: "Completed", c: "bg-emerald-500", v: stats?.jobs.completed }, { l: "Failed", c: "bg-red-500", v: stats?.jobs.failed }, { l: "Dead", c: "bg-rose-700", v: stats?.jobs.dead }].map(i => (
            <div key={i.l} className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <div className={`w-2.5 h-2.5 rounded-full ${i.c}`} />{i.l}: {i.v || 0}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Plus, RefreshCw, ChevronRight, Clock, CheckCircle, XCircle, Skull, Zap, Calendar } from "lucide-react";

const statusIcons: Record<string, any> = { queued: Clock, scheduled: Calendar, running: Zap, completed: CheckCircle, failed: XCircle, dead: Skull, claimed: Zap };
const statusColors: Record<string, string> = { queued: "status-queued", scheduled: "status-scheduled", running: "status-running", completed: "status-completed", failed: "status-failed", dead: "status-dead", claimed: "status-claimed" };

export default function QueueDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queueId = params.queueId as string;
  const [queue, setQueue] = useState<any>(null);
  const [jobs, setJobs] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({});
  const [stats, setStats] = useState<any>(null);
  const [filter, setFilter] = useState({ status: "", type: "", page: "1" });
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newJob, setNewJob] = useState({ name: "", type: "immediate", payload: "{}", priority: 0, scheduledAt: "" });

  useEffect(() => { loadAll(); }, [queueId, filter]);

  async function loadAll() {
    try {
      const [qData, jData, sData] = await Promise.all([
        api.getQueue(queueId),
        api.getJobs(queueId, { ...(filter.status && { status: filter.status }), ...(filter.type && { type: filter.type }), page: filter.page, limit: "15" }),
        api.getQueueStats(queueId),
      ]);
      setQueue(qData.queue);
      setJobs(jData.jobs);
      setPagination(jData.pagination);
      setStats(sData.stats);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let payload = {};
      try { payload = JSON.parse(newJob.payload); } catch {}
      const safePriority = Number.isNaN(newJob.priority) || newJob.priority === null ? 0 : newJob.priority;
      const jobData: any = { name: newJob.name, type: newJob.type, priority: safePriority, payload };
      if (newJob.scheduledAt) jobData.scheduledAt = new Date(newJob.scheduledAt).toISOString();
      await api.createJob(queueId, jobData);
      setShowCreate(false);
      setNewJob({ name: "", type: "immediate", payload: "{}", priority: 0, scheduledAt: "" });
      loadAll();
    } catch (err: any) { 
      console.error(err); 
      alert(err.message || 'Failed to create job');
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push("/dashboard/queues")} className="btn-secondary p-2"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{queue?.name}</h1>
          <p className="text-xs text-[var(--color-muted)]">{queue?.slug} · Priority: {queue?.priority} · Concurrency: {queue?.concurrency}</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> New Job</button>
        <button onClick={loadAll} className="btn-secondary p-2"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[{ l: "Queued", v: stats.queued, c: "text-slate-300" }, { l: "Running", v: stats.running, c: "text-amber-400" }, { l: "Completed", v: stats.completed, c: "text-emerald-400" }, { l: "Failed", v: stats.failed, c: "text-red-400" }, { l: "Avg Duration", v: stats.avg_duration_ms ? `${Math.round(stats.avg_duration_ms)}ms` : "N/A", c: "text-blue-400" }].map(s => (
            <div key={s.l} className="glass-card p-3 text-center">
              <p className="text-xs text-[var(--color-muted)]">{s.l}</p>
              <p className={`text-lg font-bold ${s.c}`}>{s.v}</p>
            </div>
          ))}
        </div>
      )}

      {/* Create Job Form */}
      {showCreate && (
        <form onSubmit={handleCreateJob} className="glass-card p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input className="input-field" placeholder="Job Name" value={newJob.name} onChange={e => setNewJob({ ...newJob, name: e.target.value })} required />
            <select className="input-field" value={newJob.type} onChange={e => setNewJob({ ...newJob, type: e.target.value })}>
              <option value="immediate">Immediate</option><option value="delayed">Delayed</option><option value="scheduled">Scheduled</option>
            </select>
            <input className="input-field" type="number" placeholder="Priority" value={Number.isNaN(newJob.priority) ? '' : newJob.priority} onChange={e => setNewJob({ ...newJob, priority: parseInt(e.target.value || "0", 10) })} />
            {(newJob.type === "delayed" || newJob.type === "scheduled") && <input className="input-field" type="datetime-local" value={newJob.scheduledAt} onChange={e => setNewJob({ ...newJob, scheduledAt: e.target.value })} />}
          </div>
          <textarea className="input-field h-20" placeholder='Payload (JSON): {"type": "email_send", "to": "user@example.com"}' value={newJob.payload} onChange={e => setNewJob({ ...newJob, payload: e.target.value })} />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm">Create Job</button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <select className="input-field w-auto" value={filter.status} onChange={e => setFilter({ ...filter, status: e.target.value, page: "1" })}>
          <option value="">All Statuses</option>
          {["queued", "scheduled", "claimed", "running", "completed", "failed", "dead"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input-field w-auto" value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value, page: "1" })}>
          <option value="">All Types</option>
          {["immediate", "delayed", "scheduled", "recurring", "batch"].map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Jobs Table */}
      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Name</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Type</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Status</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Priority</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Retries</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Created</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const Icon = statusIcons[job.status] || Clock;
              return (
                <tr key={job.id} className="border-b border-[var(--color-border)] hover:bg-white/[0.02] cursor-pointer transition-colors" onClick={() => router.push(`/dashboard/jobs/${job.id}`)}>
                  <td className="p-3 font-medium">{job.name}</td>
                  <td className="p-3"><span className="badge bg-white/5 text-[var(--color-muted)]">{job.type}</span></td>
                  <td className="p-3"><span className={`badge ${statusColors[job.status]}`}><Icon className="w-3 h-3" />{job.status}</span></td>
                  <td className="p-3">{job.priority}</td>
                  <td className="p-3">{job.retry_count}/{job.max_retries}</td>
                  <td className="p-3 text-[var(--color-muted)]">{new Date(job.created_at).toLocaleString()}</td>
                  <td className="p-3"><ChevronRight className="w-4 h-4 text-[var(--color-muted)]" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {jobs.length === 0 && <div className="p-8 text-center text-[var(--color-muted)]">No jobs found</div>}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).slice(0, 10).map(p => (
            <button key={p} onClick={() => setFilter({ ...filter, page: String(p) })} className={`px-3 py-1 rounded text-sm ${String(p) === filter.page ? "btn-primary" : "btn-secondary"}`}>{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}

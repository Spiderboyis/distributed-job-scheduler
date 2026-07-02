"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, RefreshCw, RotateCcw, Clock, CheckCircle, XCircle, Skull, Zap, Calendar, FileText } from "lucide-react";

const statusColors: Record<string, string> = { queued: "status-queued", scheduled: "status-scheduled", running: "status-running", completed: "status-completed", failed: "status-failed", dead: "status-dead", claimed: "status-claimed" };
const logLevelColors: Record<string, string> = { info: "text-blue-400", warn: "text-amber-400", error: "text-red-400", debug: "text-[var(--color-muted)]" };

export default function JobDetailPage() {
  const params = useParams();
  const router = useRouter();
  const jobId = params.jobId as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => { load(); }, [jobId]);

  async function load() {
    try { const d = await api.getJob(jobId); setData(d); } catch (err) { console.error(err); }
    setLoading(false);
  }

  const handleRetry = async () => {
    setRetrying(true);
    try { await api.retryJob(jobId); load(); } catch (err) { console.error(err); }
    setRetrying(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return <div className="text-center text-[var(--color-muted)] mt-8">Job not found</div>;

  const { job, executions, logs } = data;
  const duration = job.started_at && job.completed_at
    ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()))
    : null;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="btn-secondary p-2"><ArrowLeft className="w-4 h-4" /></button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">{job.name}</h1>
          <p className="text-xs text-[var(--color-muted)] font-mono">{job.id}</p>
        </div>
        <span className={`badge text-sm ${statusColors[job.status]}`}>{job.status}</span>
        {["failed", "dead"].includes(job.status) && (
          <button onClick={handleRetry} className="btn-primary flex items-center gap-2 text-sm" disabled={retrying}>
            <RotateCcw className="w-4 h-4" />{retrying ? "Retrying..." : "Retry"}
          </button>
        )}
        <button onClick={load} className="btn-secondary p-2"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {/* Job Details */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider">Job Details</h2>
          {[
            { l: "Type", v: job.type }, { l: "Queue", v: job.queue_name || job.queue_slug },
            { l: "Priority", v: job.priority }, { l: "Retries", v: `${job.retry_count} / ${job.max_retries}` },
            { l: "Timeout", v: `${job.timeout_ms}ms` }, { l: "Worker", v: job.worker_name || "—" },
            { l: "Duration", v: duration ? `${duration}ms` : "—" },
            { l: "Created", v: new Date(job.created_at).toLocaleString() },
            { l: "Started", v: job.started_at ? new Date(job.started_at).toLocaleString() : "—" },
            { l: "Completed", v: job.completed_at ? new Date(job.completed_at).toLocaleString() : "—" },
          ].map(({ l, v }) => (
            <div key={l} className="flex justify-between text-sm">
              <span className="text-[var(--color-muted)]">{l}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>

        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider">Payload</h2>
          <pre className="text-xs bg-[var(--color-surface)] p-3 rounded-lg overflow-auto max-h-48">{JSON.stringify(job.payload, null, 2)}</pre>
          {job.result && (<>
            <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mt-4">Result</h2>
            <pre className="text-xs bg-[var(--color-surface)] p-3 rounded-lg overflow-auto max-h-48 text-emerald-400">{JSON.stringify(job.result, null, 2)}</pre>
          </>)}
          {job.error && (<>
            <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wider mt-4">Error</h2>
            <pre className="text-xs bg-red-500/5 p-3 rounded-lg text-red-400 border border-red-500/10">{job.error}</pre>
          </>)}
        </div>
      </div>

      {/* Execution History */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">Execution History ({executions.length})</h2>
        {executions.length > 0 ? (
          <div className="space-y-2">
            {executions.map((ex: any) => (
              <div key={ex.id} className="flex items-center gap-3 p-2 rounded-lg bg-[var(--color-surface)] text-sm">
                <span className={`badge ${statusColors[ex.status]}`}>Attempt {ex.attempt}</span>
                <span className="text-[var(--color-muted)]">{ex.worker_name || "unknown worker"}</span>
                <span className="text-[var(--color-muted)]">{ex.duration_ms ? `${ex.duration_ms}ms` : "—"}</span>
                {ex.error && <span className="text-red-400 text-xs truncate flex-1">{ex.error}</span>}
                <span className="text-xs text-[var(--color-muted)] ml-auto">{new Date(ex.started_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[var(--color-muted)] text-sm">No executions yet</p>}
      </div>

      {/* Logs */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3">
          <FileText className="w-4 h-4 inline mr-1" /> Logs ({logs.length})
        </h2>
        {logs.length > 0 ? (
          <div className="space-y-1 max-h-64 overflow-auto">
            {logs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-2 text-xs py-1 border-b border-[var(--color-border)] last:border-0">
                <span className="text-[var(--color-muted)] shrink-0 w-36">{new Date(log.created_at).toLocaleString()}</span>
                <span className={`shrink-0 uppercase font-bold w-10 ${logLevelColors[log.level]}`}>{log.level}</span>
                <span className="text-[var(--color-foreground)]">{log.message}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[var(--color-muted)] text-sm">No logs</p>}
      </div>
    </div>
  );
}

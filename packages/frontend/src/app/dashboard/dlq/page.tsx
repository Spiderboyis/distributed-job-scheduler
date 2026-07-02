"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { AlertTriangle, RotateCcw, RefreshCw, Trash2 } from "lucide-react";

export default function DLQPage() {
  const [entries, setEntries] = useState<any[]>([]);
  const [pagination, setPagination] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("1");

  useEffect(() => { load(); }, [page]);

  async function load() {
    try {
      const d = await api.getDlqEntries({ page, limit: "20" });
      setEntries(d.entries);
      setPagination(d.pagination);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const handleRetry = async (id: string) => {
    try { await api.retryDlqEntry(id); load(); } catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dead Letter Queue</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Jobs that permanently failed after exhausting all retries</p>
        </div>
        <button onClick={load} className="btn-secondary flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Refresh</button>
      </div>

      <div className="glass-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Job</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Queue</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Error</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Retries</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Failed At</th>
              <th className="text-left p-3 text-xs text-[var(--color-muted)] font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-[var(--color-border)] hover:bg-white/[0.02]">
                <td className="p-3 font-medium">{entry.job_name || "Unknown"}<br/><span className="text-xs text-[var(--color-muted)]">{entry.job_type}</span></td>
                <td className="p-3 text-[var(--color-muted)]">{entry.queue_name}</td>
                <td className="p-3 max-w-xs"><p className="text-red-400 text-xs truncate">{entry.error}</p></td>
                <td className="p-3">{entry.retry_count}</td>
                <td className="p-3 text-xs text-[var(--color-muted)]">{new Date(entry.failed_at).toLocaleString()}</td>
                <td className="p-3">
                  {!entry.requeued_at ? (
                    <button onClick={() => handleRetry(entry.id)} className="btn-primary text-xs flex items-center gap-1 py-1 px-2">
                      <RotateCcw className="w-3 h-3" /> Retry
                    </button>
                  ) : <span className="text-xs text-[var(--color-foreground)] font-medium">Requeued</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 && <div className="p-8 text-center text-[var(--color-muted)]"><AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-30" />No dead letter queue entries. All jobs are healthy!</div>}
      </div>
    </div>
  );
}

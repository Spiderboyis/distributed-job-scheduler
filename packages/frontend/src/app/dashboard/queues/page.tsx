"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Layers, Pause, Play, Plus, ChevronRight, BarChart3 } from "lucide-react";

export default function QueuesPage() {
  const router = useRouter();
  const [queues, setQueues] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newQueue, setNewQueue] = useState({ name: "", slug: "", priority: 0, concurrency: 5 });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const projectsData = await api.getProjects();
      setProjects(projectsData.projects);
      if (projectsData.projects.length > 0) {
        const queuesData = await api.getQueues(projectsData.projects[0].id);
        setQueues(queuesData.queues);
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const handlePauseResume = async (queueId: string, isPaused: boolean) => {
    try {
      if (isPaused) await api.resumeQueue(queueId);
      else await api.pauseQueue(queueId);
      loadData();
    } catch (err) { console.error(err); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projects[0]) return;
    try {
      await api.createQueue(projects[0].id, newQueue);
      setShowCreate(false);
      setNewQueue({ name: "", slug: "", priority: 0, concurrency: 5 });
      loadData();
    } catch (err) { console.error(err); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Queues</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">Manage job queues and their configuration</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Queue
        </button>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="glass-card p-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input className="input-field" placeholder="Queue Name" value={newQueue.name} onChange={(e) => setNewQueue({ ...newQueue, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })} required />
            <input className="input-field" placeholder="slug" value={newQueue.slug} onChange={(e) => setNewQueue({ ...newQueue, slug: e.target.value })} required />
            <input className="input-field" type="number" placeholder="Priority" value={newQueue.priority} onChange={(e) => setNewQueue({ ...newQueue, priority: parseInt(e.target.value) })} />
            <input className="input-field" type="number" placeholder="Concurrency" value={newQueue.concurrency} onChange={(e) => setNewQueue({ ...newQueue, concurrency: parseInt(e.target.value) })} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary text-sm">Create Queue</button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {queues.map((queue) => (
          <div key={queue.id} className="glass-card p-5 cursor-pointer" onClick={() => router.push(`/dashboard/queues/${queue.id}`)}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full ${queue.is_paused ? "bg-amber-500" : "bg-emerald-500"} ${!queue.is_paused ? "animate-pulse-glow" : ""}`} />
                <h3 className="font-semibold">{queue.name}</h3>
                <span className="badge status-queued">{queue.slug}</span>
                {queue.is_paused && <span className="badge bg-amber-500/10 text-amber-400">Paused</span>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={(e) => { e.stopPropagation(); handlePauseResume(queue.id, queue.is_paused); }}
                  className="btn-secondary text-xs flex items-center gap-1 py-1 px-2">
                  {queue.is_paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                  {queue.is_paused ? "Resume" : "Pause"}
                </button>
                <ChevronRight className="w-4 h-4 text-[var(--color-muted)]" />
              </div>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-sm">
              <div><span className="text-[var(--color-muted)] text-xs block">Queued</span><span className="font-medium text-[var(--color-foreground)]">{queue.queued_count}</span></div>
              <div><span className="text-[var(--color-muted)] text-xs block">Running</span><span className="font-medium text-[var(--color-foreground)]">{queue.running_count}</span></div>
              <div><span className="text-[var(--color-muted)] text-xs block">Completed</span><span className="font-medium text-[var(--color-foreground)]">{queue.completed_count}</span></div>
              <div><span className="text-[var(--color-muted)] text-xs block">Failed</span><span className="font-medium text-[var(--color-foreground)]">{queue.failed_count}</span></div>
              <div><span className="text-[var(--color-muted)] text-xs block">Priority</span><span className="font-medium text-[var(--color-foreground)]">{queue.priority}</span></div>
              <div><span className="text-[var(--color-muted)] text-xs block">Concurrency</span><span className="font-medium text-[var(--color-foreground)]">{queue.concurrency}</span></div>
            </div>
            {queue.retry_policy_name && (
              <div className="mt-2 text-xs text-[var(--color-muted)]">
                Retry: {queue.retry_policy_name} ({queue.retry_strategy}, max {queue.max_retries})
              </div>
            )}
          </div>
        ))}
        {queues.length === 0 && <div className="glass-card p-8 text-center text-[var(--color-muted)]">No queues yet. Create one to get started.</div>}
      </div>
    </div>
  );
}

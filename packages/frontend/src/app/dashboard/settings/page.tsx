"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Settings as SettingsIcon, Key, Building2, FolderOpen, Plus, Copy, RefreshCw } from "lucide-react";

export default function SettingsPage() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function load() {
    try {
      const [orgData, projData, polData] = await Promise.all([api.getOrgs(), api.getProjects(), api.getRetryPolicies()]);
      setOrgs(orgData.organizations);
      setProjects(projData.projects);
      setPolicies(polData.policies);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const copyKey = (key: string) => { navigator.clipboard.writeText(key); setCopiedKey(key); setTimeout(() => setCopiedKey(null), 2000); };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Manage organizations, projects, and configuration</p>
      </div>

      {/* Organizations */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3 flex items-center gap-2"><Building2 className="w-4 h-4" /> Organizations</h2>
        {orgs.map(org => (
          <div key={org.id} className="flex items-center justify-between p-3 bg-[var(--color-surface)] rounded-lg mb-2">
            <div>
              <p className="font-medium">{org.name}</p>
              <p className="text-xs text-[var(--color-muted)]">{org.slug} · {org.member_count} members · {org.project_count} projects</p>
            </div>
            <span className="badge bg-blue-500/10 text-blue-400">{org.user_role}</span>
          </div>
        ))}
      </div>

      {/* Projects & API Keys */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3 flex items-center gap-2"><FolderOpen className="w-4 h-4" /> Projects & API Keys</h2>
        {projects.map(proj => (
          <div key={proj.id} className="p-3 bg-[var(--color-surface)] rounded-lg mb-2">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-medium">{proj.name}</p>
                <p className="text-xs text-[var(--color-muted)]">{proj.organization_name} · {proj.queue_count} queues</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-[var(--color-background)] rounded p-2">
              <Key className="w-3.5 h-3.5 text-[var(--color-muted)]" />
              <code className="text-xs flex-1 text-amber-400">{proj.api_key}</code>
              <button onClick={() => copyKey(proj.api_key)} className="text-xs text-[var(--color-muted)] hover:text-white">
                {copiedKey === proj.api_key ? "✓ Copied" : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Retry Policies */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3 flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Retry Policies</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {policies.map((p: any) => (
            <div key={p.id} className="p-3 bg-[var(--color-surface)] rounded-lg">
              <p className="font-medium text-sm">{p.name}</p>
              <div className="mt-2 space-y-1 text-xs text-[var(--color-muted)]">
                <p>Strategy: <span className="text-[var(--color-foreground)]">{p.strategy}</span></p>
                <p>Max Retries: <span className="text-[var(--color-foreground)]">{p.max_retries}</span></p>
                <p>Initial Delay: <span className="text-[var(--color-foreground)]">{p.initial_delay}ms</span></p>
                <p>Max Delay: <span className="text-[var(--color-foreground)]">{p.max_delay}ms</span></p>
                {p.strategy === "exponential" && <p>Backoff Factor: <span className="text-[var(--color-foreground)]">{p.backoff_factor}x</span></p>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

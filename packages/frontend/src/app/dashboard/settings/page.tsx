"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Settings as SettingsIcon, LogOut, AlertTriangle, RefreshCw } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();
  const [policies, setPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  async function load() {
    try {
      const polData = await api.getRetryPolicies();
      setPolicies(polData.policies);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const handleLogout = () => {
    api.clearToken();
    router.push("/");
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteError("");
    setIsDeleting(true);
    try {
      await api.deleteAccount(deletePassword);
      api.clearToken();
      router.push("/");
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6 animate-slide-in">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-[var(--color-muted)] mt-1">Manage configuration and account settings</p>
      </div>

      {/* Retry Policies */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-3 flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Retry Policies</h2>
        <div className="grid md:grid-cols-3 gap-3">
          {policies.map((p: any) => (
            <div key={p.id} className="p-3 bg-white/[0.02] border border-[var(--color-border)] rounded-lg">
              <p className="font-medium text-sm text-[var(--color-foreground)]">{p.name}</p>
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

      {/* Account Settings */}
      <div className="glass-card p-5">
        <h2 className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wider mb-4 flex items-center gap-2"><SettingsIcon className="w-4 h-4" /> Account Settings</h2>
        
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-white/[0.02] border border-[var(--color-border)] rounded-lg gap-4">
            <div>
              <p className="font-medium text-[var(--color-foreground)]">Sign Out</p>
              <p className="text-xs text-[var(--color-muted)]">Log out of your current session on this device.</p>
            </div>
            <button onClick={handleLogout} className="btn-secondary flex items-center justify-center gap-2 w-full sm:w-auto">
              <LogOut className="w-4 h-4" /> Sign Out
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-lg gap-4">
            <div>
              <p className="font-medium text-red-400">Delete Account</p>
              <p className="text-xs text-[var(--color-muted)]">Permanently delete your account and all associated organizations, queues, and jobs. This action cannot be undone.</p>
            </div>
            <button onClick={() => setShowDeleteModal(true)} className="btn-primary bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2 w-full sm:w-auto">
              <AlertTriangle className="w-4 h-4" /> Delete Account
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
          <div className="bg-[#0a0a0a] border border-[var(--color-border)] rounded-xl w-full max-w-md overflow-hidden animate-slide-up shadow-2xl">
            <div className="p-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <h2 className="text-lg font-bold text-red-400 flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> Delete Account</h2>
            </div>
            <form onSubmit={handleDeleteAccount} className="p-5 space-y-4">
              <p className="text-sm text-[var(--color-muted)]">This action will permanently delete your account, your organizations, and all queues and jobs. This action is irreversible.</p>
              <div>
                <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Confirm your password to continue</label>
                <input 
                  type="password" 
                  value={deletePassword} 
                  onChange={(e) => setDeletePassword(e.target.value)} 
                  className="input-field" 
                  placeholder="Enter your password" 
                  required 
                />
              </div>
              {deleteError && <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-xs">{deleteError}</div>}
              
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setShowDeleteModal(false)} className="btn-secondary">Cancel</button>
                <button type="submit" disabled={isDeleting} className="btn-primary bg-red-500 hover:bg-red-600 text-white">
                  {isDeleting ? "Deleting..." : "Permanently Delete"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

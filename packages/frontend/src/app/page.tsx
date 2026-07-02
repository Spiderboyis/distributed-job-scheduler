"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Zap } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("demo@jobscheduler.dev");
  const [password, setPassword] = useState("demo123456");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isLogin) {
        await api.login(email, password);
      } else {
        await api.register(email, password, name);
      }
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "radial-gradient(ellipse at top, #111827 0%, #0a0f1e 50%)" }}>
      <div className="glass-card p-8 w-full max-w-md animate-slide-in">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">JobForge</h1>
        </div>
        <p className="text-center text-sm text-[var(--color-muted)] mb-6">Distributed Job Scheduling Platform</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-field" placeholder="Your name" required={!isLogin} />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-field" placeholder="email@example.com" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="input-field" placeholder="••••••" required />
          </div>
          {error && <p className="text-xs text-red-400 bg-red-400/10 rounded-lg p-2">{error}</p>}
          <button type="submit" className="btn-primary w-full py-2.5" disabled={loading}>
            {loading ? "Loading..." : isLogin ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--color-muted)] mt-4">
          {isLogin ? "Don't have an account?" : "Already have an account?"}
          <button onClick={() => setIsLogin(!isLogin)} className="text-blue-400 ml-1 hover:underline">{isLogin ? "Register" : "Sign In"}</button>
        </p>
        <p className="text-center text-xs text-[var(--color-muted)] mt-2 opacity-60">Demo: demo@jobscheduler.dev / demo123456</p>
      </div>
    </div>
  );
}

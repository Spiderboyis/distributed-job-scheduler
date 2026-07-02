"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { LayoutDashboard, Layers, Server, AlertTriangle, Settings, Zap, LogOut, ChevronRight } from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/dashboard/queues", icon: Layers, label: "Queues" },
  { href: "/dashboard/workers", icon: Server, label: "Workers" },
  { href: "/dashboard/dlq", icon: AlertTriangle, label: "Dead Letter Queue" },
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const token = api.getToken();
    if (!token) { router.push("/"); return; }
    api.getMe().then(data => setUser(data.user)).catch(() => { api.clearToken(); router.push("/"); });
  }, [router]);

  const handleLogout = () => { api.clearToken(); router.push("/"); };

  return (
    <div className="min-h-screen flex relative overflow-hidden bg-[#000000]">
      {/* Background Orbs for Glassmorphism */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-900/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] w-[500px] h-[500px] bg-emerald-900/10 rounded-full blur-[150px] pointer-events-none transform -translate-x-1/2 -translate-y-1/2" />
      
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-16" : "w-60"} relative z-10 border-r border-white/10 bg-white/[0.02] backdrop-blur-3xl flex flex-col transition-all duration-200`}>
        <div className="p-4 flex items-center gap-2 border-b border-[var(--color-border)]">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)] flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-black" />
          </div>
          {!collapsed && <span className="font-bold text-sm tracking-tight text-[var(--color-foreground)]">JobForge</span>}
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${isActive ? "bg-white/[0.05] text-[var(--color-foreground)] border border-[var(--color-border)] shadow-sm" : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-white/[0.02]"}`}>
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[var(--color-border)] mt-auto">
          {!collapsed && user && <p className="text-xs text-[var(--color-muted)] mb-2 truncate px-2">{user.email}</p>}
          <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-[var(--color-muted)] hover:text-red-400 hover:bg-white/[0.05] rounded-lg transition-colors w-full px-2 py-2">
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
      {/* Main Content */}
      <main className="flex-1 overflow-auto relative z-10">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

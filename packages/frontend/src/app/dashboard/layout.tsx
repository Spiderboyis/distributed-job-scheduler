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
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-16" : "w-60"} border-r border-[var(--color-border)] bg-[var(--color-surface)] flex flex-col transition-all duration-200`}>
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
        <div className="p-3 border-t border-[var(--color-border)]">
          {!collapsed && user && <p className="text-xs text-[var(--color-muted)] mb-2 truncate">{user.email}</p>}
          <button onClick={handleLogout} className="flex items-center gap-2 text-xs text-[var(--color-muted)] hover:text-red-400 transition-colors w-full px-2 py-1">
            <LogOut className="w-3.5 h-3.5" />{!collapsed && "Sign Out"}
          </button>
        </div>
      </aside>
      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-7xl mx-auto">{children}</div>
      </main>
    </div>
  );
}

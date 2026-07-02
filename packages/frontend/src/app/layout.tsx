import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JobForge — Distributed Job Scheduler",
  description: "Production-grade distributed job scheduling platform with real-time monitoring, retry management, and queue orchestration.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}

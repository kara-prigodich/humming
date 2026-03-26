"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import MyDashboard from "@/components/MyDashboard";
import TeamView from "@/components/TeamView";
import SRPipeline from "@/components/SRPipeline";
import type { SessionAgent } from "@/lib/types";

type Tab = "my-dashboard" | "team-view" | "sr-pipeline";

const TABS: { id: Tab; label: string }[] = [
  { id: "my-dashboard", label: "My Dashboard" },
  { id: "team-view", label: "Team View" },
  { id: "sr-pipeline", label: "SR Pipeline" },
];

interface DashboardClientProps {
  agent: SessionAgent;
}

export default function DashboardClient({ agent }: DashboardClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("my-dashboard");
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* ── Top nav bar ─────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
              </div>
              <span className="font-semibold text-gray-900 text-sm">
                Workday Admin
              </span>
            </div>

            {/* Tab navigation */}
            <nav className="flex items-center gap-1" aria-label="Main navigation">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-4 text-sm font-medium transition-colors ${
                    activeTab === tab.id ? "tab-active" : "tab-inactive"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            {/* User + logout */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-medium text-gray-800 leading-none">
                  {agent.first_name} {agent.last_name}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{agent.email}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="btn-secondary text-xs px-3 py-1.5"
              >
                {loggingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Page heading */}
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">
            {TABS.find((t) => t.id === activeTab)?.label}
          </h1>
          {activeTab === "my-dashboard" && (
            <p className="text-sm text-gray-500 mt-0.5">
              Personalized view for{" "}
              <span className="font-medium text-gray-700">
                {agent.first_name} {agent.last_name}
              </span>
            </p>
          )}
          {activeTab === "team-view" && (
            <p className="text-sm text-gray-500 mt-0.5">
              Workload overview for the entire Workday admin team
            </p>
          )}
          {activeTab === "sr-pipeline" && (
            <p className="text-sm text-gray-500 mt-0.5">
              Pipeline view for Workday Change Request service requests
            </p>
          )}
        </div>

        {/* Tab content */}
        {activeTab === "my-dashboard" && (
          <MyDashboard currentAgent={agent} />
        )}
        {activeTab === "team-view" && <TeamView />}
        {activeTab === "sr-pipeline" && <SRPipeline />}
      </main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 bg-white py-3 px-6 text-center text-xs text-gray-400">
        Workday Admin Dashboard · FreshService data ·{" "}
        <a
          href="https://hummingbirdhealthcare.freshservice.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Open FreshService
        </a>
      </footer>
    </div>
  );
}

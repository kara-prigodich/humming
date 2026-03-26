"use client";

import { useState, useEffect, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import StatCard from "./StatCard";
import TicketDrawer from "./TicketDrawer";
import type { Ticket, Agent, StatusChoice, SessionAgent } from "@/lib/types";
import { STANDARD_STATUSES, isWorkdaySR } from "@/lib/freshservice";

const DONUT_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#6d28d9",
];

interface DrawerState {
  title: string;
  tickets: Ticket[];
}

interface MyDashboardProps {
  currentAgent: SessionAgent;
}

export default function MyDashboard({ currentAgent }: MyDashboardProps) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [statuses, setStatuses] = useState<StatusChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ticketsRes, agentsRes, fieldsRes] = await Promise.all([
        fetch("/api/tickets"),
        fetch("/api/agents"),
        fetch("/api/ticket-fields"),
      ]);

      if (!ticketsRes.ok || !agentsRes.ok) {
        throw new Error("Failed to load dashboard data");
      }

      const [ticketsData, agentsData, fieldsData] = await Promise.all([
        ticketsRes.json(),
        agentsRes.json(),
        fieldsRes.json(),
      ]);

      setTickets(ticketsData.tickets ?? []);
      setAgents(agentsData.agents ?? []);
      if (fieldsData.statuses) setStatuses(fieldsData.statuses);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Status lookup ──────────────────────────────────────────────────────────
  function statusIdByLabel(label: string): number | undefined {
    return statuses.find(
      (s) => s.label.toLowerCase() === label.toLowerCase()
    )?.id;
  }

  const STATUS_IN_PROGRESS =
    statusIdByLabel("In Progress") ?? statusIdByLabel("In progress");
  const STATUS_ON_HOLD =
    statusIdByLabel("On Hold") ?? statusIdByLabel("On hold");
  const STATUS_WAITING_THIRD_PARTY =
    statusIdByLabel("Waiting on Third Party") ??
    statusIdByLabel("Waiting on 3rd Party") ??
    statusIdByLabel("Third Party");
  const STATUS_BACKLOG = statusIdByLabel("Backlog");

  // ── Derived ticket groups ──────────────────────────────────────────────────
  const mine = tickets.filter((t) => t.responder_id === currentAgent.id);

  const myNew = mine.filter((t) => t.status === STANDARD_STATUSES.OPEN);

  const myInProgress = mine.filter(
    (t) => STATUS_IN_PROGRESS !== undefined && t.status === STATUS_IN_PROGRESS
  );

  const myPendingResolved = mine.filter(
    (t) =>
      t.status === STANDARD_STATUSES.PENDING ||
      t.status === STANDARD_STATUSES.RESOLVED
  );

  const myOnHoldThirdParty = mine.filter(
    (t) =>
      (STATUS_ON_HOLD !== undefined && t.status === STATUS_ON_HOLD) ||
      (STATUS_WAITING_THIRD_PARTY !== undefined &&
        t.status === STATUS_WAITING_THIRD_PARTY)
  );

  const myBackloggedSRs = mine.filter(
    (t) =>
      isWorkdaySR(t) &&
      (STATUS_BACKLOG !== undefined
        ? t.status === STATUS_BACKLOG
        : t.status === STANDARD_STATUSES.OPEN && !t.responder_id)
  );

  const myClosed = mine.filter((t) => t.status === STANDARD_STATUSES.CLOSED);

  const allUnresolved = tickets.filter(
    (t) =>
      t.status !== STANDARD_STATUSES.RESOLVED &&
      t.status !== STANDARD_STATUSES.CLOSED
  );

  const unassignedOpen = tickets.filter(
    (t) => t.status === STANDARD_STATUSES.OPEN && !t.responder_id
  );

  // ── Donut chart data ───────────────────────────────────────────────────────
  const agentMap = new Map(agents.map((a) => [a.id, a]));

  const byAgent = new Map<number | null, Ticket[]>();
  for (const t of allUnresolved) {
    const key = t.responder_id ?? null;
    if (!byAgent.has(key)) byAgent.set(key, []);
    byAgent.get(key)!.push(t);
  }

  const donutData = Array.from(byAgent.entries())
    .map(([agentId, tix]) => {
      const agent = agentId ? agentMap.get(agentId) : null;
      const name = agent
        ? `${agent.first_name} ${agent.last_name}`
        : "Unassigned";
      return { name, value: tix.length, tickets: tix, agentId };
    })
    .sort((a, b) => b.value - a.value);

  function openDrawer(title: string, tix: Ticket[]) {
    setDrawer({ title, tickets: tix });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 font-medium">Failed to load tickets</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button
          onClick={fetchData}
          className="mt-4 btn-primary text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Stat cards grid ─────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          My Tickets
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <StatCard
            label="My New Open Tickets"
            count={myNew.length}
            color="bg-blue-600"
            onClick={() => openDrawer("My New Open Tickets", myNew)}
          />
          <StatCard
            label="My In Progress Tickets"
            count={myInProgress.length}
            color="bg-emerald-600"
            onClick={() =>
              openDrawer("My In Progress Tickets", myInProgress)
            }
          />
          <StatCard
            label="My Pending / Resolved"
            count={myPendingResolved.length}
            color="bg-yellow-600"
            onClick={() =>
              openDrawer("My Pending / Resolved Tickets", myPendingResolved)
            }
          />
          <StatCard
            label="My On Hold / 3rd Party"
            count={myOnHoldThirdParty.length}
            color="bg-orange-600"
            onClick={() =>
              openDrawer("My On Hold / 3rd Party Tickets", myOnHoldThirdParty)
            }
          />
          <StatCard
            label="My Backlogged SRs"
            count={myBackloggedSRs.length}
            color="bg-purple-700"
            onClick={() =>
              openDrawer("My Backlogged Service Requests", myBackloggedSRs)
            }
          />
          <StatCard
            label="My Closed Tickets"
            count={myClosed.length}
            color="bg-gray-600"
            onClick={() => openDrawer("My Closed Tickets", myClosed)}
          />
          <StatCard
            label="All Unresolved Tickets"
            count={allUnresolved.length}
            color="bg-red-600"
            onClick={() =>
              openDrawer("All Unresolved Tickets (Team)", allUnresolved)
            }
          />
          <StatCard
            label="Unassigned Open Tickets"
            count={unassignedOpen.length}
            color="bg-sky-600"
            onClick={() =>
              openDrawer("Unassigned Open Tickets", unassignedOpen)
            }
          />
        </div>

        {/* Custom status note */}
        {STATUS_IN_PROGRESS === undefined && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Note: &ldquo;In Progress&rdquo; and similar custom statuses were not found in your
            FreshService ticket fields. Counts for those cards may be 0. Check
            that custom statuses exist in your FreshService instance.
          </p>
        )}
      </section>

      {/* ── Donut chart ─────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          All Unresolved Tickets by Assigned To
        </h2>

        {allUnresolved.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500 text-sm">
            No unresolved tickets
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <ResponsiveContainer width="100%" height={340}>
              <PieChart>
                <Pie
                  data={donutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={130}
                  paddingAngle={2}
                  dataKey="value"
                  onClick={(entry) => {
                    const d = entry as (typeof donutData)[number];
                    openDrawer(
                      `Unresolved Tickets — ${d.name}`,
                      d.tickets
                    );
                  }}
                  style={{ cursor: "pointer" }}
                >
                  {donutData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={DONUT_COLORS[index % DONUT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `${value} ticket${value !== 1 ? "s" : ""}`,
                    name,
                  ]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 text-center mt-2">
              Click a segment to view tickets for that agent
            </p>
          </div>
        )}
      </section>

      {/* ── Drawer ──────────────────────────────────────────────────────── */}
      {drawer && (
        <TicketDrawer
          title={drawer.title}
          tickets={drawer.tickets}
          agents={agents}
          statuses={statuses}
          onClose={() => setDrawer(null)}
          onTicketUpdated={fetchData}
        />
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import TicketDrawer from "./TicketDrawer";
import type { Ticket, Agent, StatusChoice } from "@/lib/types";
import { STANDARD_STATUSES, isOverdue, PRIORITY } from "@/lib/freshservice";

// Days of the week for heatmap columns
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getDayOfWeek(isoDate: string): number {
  return new Date(isoDate).getDay();
}

// Color intensity from ticket count → Tailwind bg class
function heatColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "bg-gray-50 text-gray-300";
  const intensity = count / max;
  if (intensity > 0.8) return "bg-blue-700 text-white";
  if (intensity > 0.6) return "bg-blue-500 text-white";
  if (intensity > 0.4) return "bg-blue-400 text-white";
  if (intensity > 0.2) return "bg-blue-200 text-blue-900";
  return "bg-blue-100 text-blue-800";
}

function isSlaBreached(ticket: Ticket): boolean {
  return isOverdue(ticket);
}

function isUrgent(ticket: Ticket): boolean {
  return ticket.priority === PRIORITY.URGENT;
}

function cellNeedsAlert(tickets: Ticket[]): boolean {
  return tickets.some((t) => isSlaBreached(t) || isUrgent(t));
}

interface DrawerState {
  title: string;
  tickets: Ticket[];
}

export default function TeamView() {
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
        throw new Error("Failed to load team data");
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

  const statusIdByLabel = (label: string) =>
    statuses.find((s) => s.label.toLowerCase() === label.toLowerCase())?.id;

  const STATUS_IN_PROGRESS =
    statusIdByLabel("In Progress") ?? statusIdByLabel("In progress");

  function statusLabel(id: number): string {
    return statuses.find((s) => s.id === id)?.label ?? `Status ${id}`;
  }

  function agentName(a: Agent) {
    return `${a.first_name} ${a.last_name}`.trim();
  }

  // ── Per-agent summaries ────────────────────────────────────────────────────
  const summaries = agents.map((agent) => {
    const agentTickets = tickets.filter((t) => t.responder_id === agent.id);
    const unresolved = agentTickets.filter(
      (t) =>
        t.status !== STANDARD_STATUSES.RESOLVED &&
        t.status !== STANDARD_STATUSES.CLOSED
    );

    return {
      agent,
      open: agentTickets.filter((t) => t.status === STANDARD_STATUSES.OPEN)
        .length,
      inProgress: agentTickets.filter(
        (t) => STATUS_IN_PROGRESS !== undefined && t.status === STATUS_IN_PROGRESS
      ).length,
      pending: agentTickets.filter(
        (t) => t.status === STANDARD_STATUSES.PENDING
      ).length,
      urgent: agentTickets.filter(isUrgent).length,
      overdue: agentTickets.filter(isSlaBreached).length,
      total: unresolved.length,
      allTickets: agentTickets,
    };
  });

  // ── Heatmap data: agent × day ──────────────────────────────────────────────
  // Map agent.id → day → tickets (unresolved only)
  const heatmapData = new Map<
    number,
    Map<number, Ticket[]>
  >();

  for (const agent of agents) {
    const dayMap = new Map<number, Ticket[]>();
    for (let d = 0; d < 7; d++) dayMap.set(d, []);
    heatmapData.set(agent.id, dayMap);
  }

  const unresolvedTickets = tickets.filter(
    (t) =>
      t.status !== STANDARD_STATUSES.RESOLVED &&
      t.status !== STANDARD_STATUSES.CLOSED
  );

  for (const t of unresolvedTickets) {
    if (t.responder_id && heatmapData.has(t.responder_id)) {
      const day = getDayOfWeek(t.updated_at);
      heatmapData.get(t.responder_id)!.get(day)!.push(t);
    }
  }

  // Max count for color scaling
  let maxCount = 0;
  for (const [, dayMap] of heatmapData) {
    for (const [, tix] of dayMap) {
      if (tix.length > maxCount) maxCount = tix.length;
    }
  }

  function openDrawer(title: string, tix: Ticket[]) {
    setDrawer({ title, tickets: tix });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading team data…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 font-medium">Failed to load team data</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button onClick={fetchData} className="mt-4 btn-primary text-sm">
          Retry
        </button>
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
        No agents found in the Workday group.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Heatmap ─────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Workload Heatmap — Unresolved Tickets by Agent &amp; Day Last Updated
          </h2>
          <span className="text-xs text-gray-400">
            Red border = SLA breach or Urgent
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap border-b border-gray-200 min-w-[140px]">
                  Agent
                </th>
                {DAYS.map((d) => (
                  <th
                    key={d}
                    className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase border-b border-gray-200 min-w-[60px]"
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agents.map((agent, rowIdx) => {
                const dayMap = heatmapData.get(agent.id)!;
                return (
                  <tr
                    key={agent.id}
                    className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                  >
                    <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap border-b border-gray-100">
                      {agentName(agent)}
                    </td>
                    {DAYS.map((_, dayIdx) => {
                      const cellTickets = dayMap.get(dayIdx) ?? [];
                      const count = cellTickets.length;
                      const alert = cellNeedsAlert(cellTickets);
                      return (
                        <td
                          key={dayIdx}
                          className="px-1 py-2 text-center border-b border-gray-100"
                        >
                          <button
                            onClick={() =>
                              openDrawer(
                                `${agentName(agent)} — ${DAYS[dayIdx]} tickets`,
                                cellTickets
                              )
                            }
                            disabled={count === 0}
                            className={`
                              w-full rounded-md py-2 px-1 text-xs font-semibold
                              transition-all
                              ${heatColor(count, maxCount)}
                              ${alert ? "ring-2 ring-red-500 ring-offset-1" : ""}
                              ${count > 0 ? "hover:opacity-80 cursor-pointer" : "cursor-default"}
                            `}
                          >
                            {count > 0 ? count : ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Agent summary table ──────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Agent Summary — Unresolved Counts
        </h2>

        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                  Agent
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-blue-700 uppercase">
                  Open
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-emerald-700 uppercase">
                  In Progress
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-yellow-700 uppercase">
                  Pending
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-red-700 uppercase">
                  Urgent
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-orange-700 uppercase">
                  Overdue
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-700 uppercase">
                  Total Unresolved
                </th>
              </tr>
            </thead>
            <tbody>
              {summaries.map((s, idx) => (
                <tr
                  key={s.agent.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 ${
                    idx % 2 === 0 ? "" : "bg-gray-50/30"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <button
                      onClick={() =>
                        openDrawer(
                          `${agentName(s.agent)}'s Tickets`,
                          s.allTickets
                        )
                      }
                      className="text-blue-700 hover:underline"
                    >
                      {agentName(s.agent)}
                    </button>
                  </td>
                  <td className="text-center px-4 py-3 tabular-nums">
                    {s.open > 0 ? (
                      <span className="font-semibold text-blue-700">
                        {s.open}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-3 tabular-nums">
                    {s.inProgress > 0 ? (
                      <span className="font-semibold text-emerald-700">
                        {s.inProgress}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-3 tabular-nums">
                    {s.pending > 0 ? (
                      <span className="font-semibold text-yellow-700">
                        {s.pending}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-3 tabular-nums">
                    {s.urgent > 0 ? (
                      <span className="font-semibold text-red-700">
                        {s.urgent}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-3 tabular-nums">
                    {s.overdue > 0 ? (
                      <span className="font-semibold text-orange-700">
                        {s.overdue}
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-center px-4 py-3 tabular-nums font-semibold text-gray-800">
                    {s.total}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Drawer */}
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

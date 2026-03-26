"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import TicketDrawer from "./TicketDrawer";
import type { Ticket, Agent, StatusChoice } from "@/lib/types";
import { STANDARD_STATUSES, WORKDAY_SR_PREFIX } from "@/lib/freshservice";

// Strip the "Workday Change Request: " prefix for display
function displaySubject(subject: string): string {
  return subject.startsWith(WORKDAY_SR_PREFIX)
    ? subject.slice(WORKDAY_SR_PREFIX.length).trim()
    : subject;
}

const PRIORITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

const PRIORITY_COLOR: Record<number, string> = {
  1: "text-gray-500",
  2: "text-blue-600",
  3: "text-orange-600",
  4: "text-red-600 font-semibold",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type SortKey =
  | "id"
  | "subject"
  | "priority"
  | "created_at"
  | "updated_at"
  | "category"
  | "responder";

interface Lane {
  id: string;
  label: string;
  description: string;
  color: string;
  headerColor: string;
  tickets: Ticket[];
}

interface DrawerState {
  title: string;
  tickets: Ticket[];
}

export default function SRPipeline() {
  const [srs, setSrs] = useState<Ticket[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [statuses, setStatuses] = useState<StatusChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drill-down table state
  const [activeLane, setActiveLane] = useState<Lane | null>(null);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [srRes, agentsRes, fieldsRes] = await Promise.all([
        fetch("/api/service-requests"),
        fetch("/api/agents"),
        fetch("/api/ticket-fields"),
      ]);

      if (!srRes.ok || !agentsRes.ok) {
        throw new Error("Failed to load SR pipeline data");
      }

      const [srData, agentsData, fieldsData] = await Promise.all([
        srRes.json(),
        agentsRes.json(),
        fieldsRes.json(),
      ]);

      setSrs(srData.serviceRequests ?? []);
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

  const agentMap = useMemo(
    () => new Map(agents.map((a) => [a.id, a])),
    [agents]
  );

  function agentName(id: number | null): string {
    if (!id) return "Unassigned";
    const a = agentMap.get(id);
    return a ? `${a.first_name} ${a.last_name}` : `Agent #${id}`;
  }

  function statusIdByLabel(label: string): number | undefined {
    return statuses.find(
      (s) => s.label.toLowerCase() === label.toLowerCase()
    )?.id;
  }

  const STATUS_IN_PROGRESS =
    statusIdByLabel("In Progress") ?? statusIdByLabel("In progress");
  const STATUS_BACKLOG = statusIdByLabel("Backlog");

  // ── Lane classification ────────────────────────────────────────────────────
  const lanes: Lane[] = useMemo(() => {
    const backlog = srs.filter((t) =>
      STATUS_BACKLOG !== undefined
        ? t.status === STATUS_BACKLOG
        : t.status === STANDARD_STATUSES.OPEN && !t.responder_id
    );

    const onDeck = srs.filter(
      (t) =>
        t.status === STANDARD_STATUSES.OPEN &&
        !!t.responder_id &&
        (STATUS_IN_PROGRESS === undefined || t.status !== STATUS_IN_PROGRESS) &&
        (STATUS_BACKLOG === undefined || t.status !== STATUS_BACKLOG)
    );

    const inProgress = srs.filter(
      (t) =>
        STATUS_IN_PROGRESS !== undefined && t.status === STATUS_IN_PROGRESS
    );

    const pendingApproval = srs.filter(
      (t) => t.status === STANDARD_STATUSES.PENDING
    );

    const resolved = srs.filter(
      (t) => t.status === STANDARD_STATUSES.RESOLVED
    );

    return [
      {
        id: "backlog",
        label: "Backlog",
        description: "Open, unassigned or newly created",
        color: "border-gray-300 bg-gray-50",
        headerColor: "bg-gray-100 text-gray-700",
        tickets: backlog,
      },
      {
        id: "on-deck",
        label: "On Deck",
        description: "Open, assigned, not yet in progress",
        color: "border-blue-200 bg-blue-50",
        headerColor: "bg-blue-100 text-blue-700",
        tickets: onDeck,
      },
      {
        id: "in-progress",
        label: "In Progress",
        description: "Actively being worked on",
        color: "border-emerald-200 bg-emerald-50",
        headerColor: "bg-emerald-100 text-emerald-700",
        tickets: inProgress,
      },
      {
        id: "pending-approval",
        label: "Pending Approval",
        description: "Awaiting requester / approver",
        color: "border-yellow-200 bg-yellow-50",
        headerColor: "bg-yellow-100 text-yellow-700",
        tickets: pendingApproval,
      },
      {
        id: "resolved",
        label: "Resolved",
        description: "Completed",
        color: "border-purple-200 bg-purple-50",
        headerColor: "bg-purple-100 text-purple-700",
        tickets: resolved,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srs, STATUS_IN_PROGRESS, STATUS_BACKLOG]);

  // ── Drill-down table with sort + search ────────────────────────────────────
  const tableTickets = useMemo(() => {
    if (!activeLane) return [];
    let tix = [...activeLane.tickets];

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      tix = tix.filter(
        (t) =>
          String(t.id).includes(q) ||
          t.subject.toLowerCase().includes(q) ||
          (t.category ?? "").toLowerCase().includes(q) ||
          agentName(t.responder_id).toLowerCase().includes(q)
      );
    }

    tix.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";
      switch (sortKey) {
        case "id":
          va = a.id;
          vb = b.id;
          break;
        case "subject":
          va = a.subject.toLowerCase();
          vb = b.subject.toLowerCase();
          break;
        case "priority":
          va = a.priority;
          vb = b.priority;
          break;
        case "created_at":
          va = a.created_at;
          vb = b.created_at;
          break;
        case "updated_at":
          va = a.updated_at;
          vb = b.updated_at;
          break;
        case "category":
          va = (a.category ?? "").toLowerCase();
          vb = (b.category ?? "").toLowerCase();
          break;
        case "responder":
          va = agentName(a.responder_id).toLowerCase();
          vb = agentName(b.responder_id).toLowerCase();
          break;
      }
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return tix;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLane, search, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col)
      return <span className="ml-0.5 opacity-30 select-none">↕</span>;
    return (
      <span className="ml-0.5 select-none">
        {sortDir === "asc" ? "↑" : "↓"}
      </span>
    );
  }

  function ThSort({
    col,
    label,
  }: {
    col: SortKey;
    label: string;
  }) {
    return (
      <th
        className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap cursor-pointer select-none hover:text-gray-800"
        onClick={() => handleSort(col)}
      >
        {label}
        <SortIcon col={col} />
      </th>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-700 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading SR pipeline…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 font-medium">Failed to load SR pipeline</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button onClick={fetchData} className="mt-4 btn-primary text-sm">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Pipeline lane cards ──────────────────────────────────────────── */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Workday Change Request Pipeline
          </h2>
          <span className="text-xs text-gray-400">
            {srs.length} total SR{srs.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {lanes.map((lane) => (
            <button
              key={lane.id}
              onClick={() => {
                setActiveLane(lane);
                setSearch("");
                setSortKey("id");
                setSortDir("desc");
              }}
              className={`
                border-2 rounded-xl p-5 text-left transition-all hover:shadow-md
                ${lane.color}
                ${activeLane?.id === lane.id ? "ring-2 ring-offset-2 ring-blue-500 shadow-md" : ""}
              `}
            >
              <div
                className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-3 ${lane.headerColor}`}
              >
                {lane.label}
              </div>
              <div className="text-3xl font-bold text-gray-900 tabular-nums">
                {lane.tickets.length}
              </div>
              <div className="text-xs text-gray-500 mt-1 leading-snug">
                {lane.description}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ── Drill-down table ─────────────────────────────────────────────── */}
      {activeLane && (
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50 gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">{activeLane.label}</h3>
              <p className="text-xs text-gray-500">
                {tableTickets.length} of {activeLane.tickets.length} SR
                {activeLane.tickets.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
                />
                <svg
                  className="absolute left-2.5 top-2 w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              </div>

              {/* Open in drawer */}
              <button
                onClick={() =>
                  setDrawer({
                    title: `${activeLane.label} — All SRs`,
                    tickets: activeLane.tickets,
                  })
                }
                className="btn-secondary text-xs px-3 py-1.5"
              >
                Drawer view
              </button>

              <button
                onClick={() => setActiveLane(null)}
                className="text-gray-400 hover:text-gray-600 ml-1"
                aria-label="Close table"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <ThSort col="id" label="SR #" />
                  <ThSort col="subject" label="Subject" />
                  <ThSort col="category" label="Category" />
                  <ThSort col="priority" label="Priority" />
                  <ThSort col="responder" label="Assigned To" />
                  <ThSort col="created_at" label="Created" />
                  <ThSort col="updated_at" label="Last Updated" />
                </tr>
              </thead>
              <tbody>
                {tableTickets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="text-center py-10 text-gray-400 text-sm"
                    >
                      {search ? "No results match your search." : "No SRs in this lane."}
                    </td>
                  </tr>
                ) : (
                  tableTickets.map((t, idx) => (
                    <tr
                      key={t.id}
                      className={`border-b border-gray-100 hover:bg-blue-50/40 ${
                        idx % 2 === 0 ? "" : "bg-gray-50/30"
                      }`}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <a
                          href={`https://hummingbirdhealthcare.freshservice.com/helpdesk/tickets/${t.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline font-medium"
                        >
                          #{t.id}
                        </a>
                      </td>
                      <td className="px-3 py-2.5 max-w-xs">
                        <span
                          className="block truncate text-gray-800"
                          title={displaySubject(t.subject)}
                        >
                          {displaySubject(t.subject)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                        {t.category ?? (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2.5 whitespace-nowrap ${
                          PRIORITY_COLOR[t.priority] ?? ""
                        }`}
                      >
                        {PRIORITY_LABEL[t.priority] ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-700">
                        {agentName(t.responder_id)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-gray-500">
                        {formatDate(t.updated_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

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

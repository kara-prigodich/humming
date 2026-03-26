"use client";

import { useEffect, useRef, useState } from "react";
import type { Ticket, Agent, StatusChoice } from "@/lib/types";
import { STANDARD_STATUSES } from "@/lib/freshservice";

interface TicketDrawerProps {
  title: string;
  tickets: Ticket[];
  agents: Agent[];
  statuses: StatusChoice[];
  onClose: () => void;
  onTicketUpdated?: () => void;
}

const PRIORITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

const PRIORITY_COLOR: Record<number, string> = {
  1: "bg-gray-100 text-gray-700",
  2: "bg-blue-100 text-blue-700",
  3: "bg-orange-100 text-orange-700",
  4: "bg-red-100 text-red-700",
};

function agentName(agents: Agent[], id: number | null): string {
  if (!id) return "—";
  const a = agents.find((ag) => ag.id === id);
  return a ? `${a.first_name} ${a.last_name}` : `Agent #${id}`;
}

function statusLabel(statuses: StatusChoice[], id: number): string {
  return statuses.find((s) => s.id === id)?.label ?? `Status ${id}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function isOverdue(ticket: Ticket): boolean {
  if (!ticket.due_by) return false;
  const s = ticket.status;
  const resolved = s === STANDARD_STATUSES.RESOLVED || s === STANDARD_STATUSES.CLOSED;
  return !resolved && new Date(ticket.due_by) < new Date();
}

interface TicketRowProps {
  ticket: Ticket;
  agents: Agent[];
  statuses: StatusChoice[];
  onTicketUpdated?: () => void;
}

function TicketRow({ ticket, agents, statuses, onTicketUpdated }: TicketRowProps) {
  const [editing, setEditing] = useState(false);
  const [newStatus, setNewStatus] = useState<string>(String(ticket.status));
  const [newAssignee, setNewAssignee] = useState<string>(
    ticket.responder_id ? String(ticket.responder_id) : ""
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const updates: Record<string, number> = {};
      if (newStatus && Number(newStatus) !== ticket.status) {
        updates.status = Number(newStatus);
      }
      const assigneeId = newAssignee ? Number(newAssignee) : null;
      if (assigneeId !== ticket.responder_id) {
        updates.responder_id = assigneeId ?? 0;
      }

      if (Object.keys(updates).length === 0) {
        setEditing(false);
        return;
      }

      const res = await fetch("/api/tickets/update", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ticket.id, ...updates }),
      });

      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error ?? "Save failed");
        return;
      }

      setEditing(false);
      onTicketUpdated?.();
    } finally {
      setSaving(false);
    }
  }

  const overdue = isOverdue(ticket);

  return (
    <div
      className={`border rounded-lg p-4 space-y-2 ${
        overdue ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <a
            href={`https://${process.env.NEXT_PUBLIC_FS_DOMAIN ?? ""}helpdesk/tickets/${ticket.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            #{ticket.id}
          </a>
          <span className="ml-2 text-sm text-gray-800 leading-snug">
            {ticket.subject}
          </span>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
            PRIORITY_COLOR[ticket.priority] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {PRIORITY_LABEL[ticket.priority] ?? "—"}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
        <span>
          <span className="font-medium">Status:</span>{" "}
          {statusLabel(statuses, ticket.status)}
          {overdue && (
            <span className="ml-1 text-red-600 font-semibold">(Overdue)</span>
          )}
        </span>
        <span>
          <span className="font-medium">Assigned:</span>{" "}
          {agentName(agents, ticket.responder_id)}
        </span>
        <span>
          <span className="font-medium">Due:</span>{" "}
          {formatDate(ticket.due_by)}
        </span>
        <span>
          <span className="font-medium">Updated:</span>{" "}
          {formatDate(ticket.updated_at)}
        </span>
      </div>

      {/* Inline edit controls */}
      {!editing ? (
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-blue-600 hover:underline mt-1"
        >
          Edit status / assignee
        </button>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2 items-center">
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs"
          >
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>

          <select
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs"
          >
            <option value="">Unassigned</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.first_name} {a.last_name}
              </option>
            ))}
          </select>

          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => {
              setEditing(false);
              setSaveError(null);
            }}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
          {saveError && (
            <span className="text-xs text-red-600">{saveError}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function TicketDrawer({
  title,
  tickets,
  agents,
  statuses,
  onClose,
  onTicketUpdated,
}: TicketDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5 text-gray-600"
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

        {/* Ticket list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tickets.length === 0 ? (
            <p className="text-sm text-gray-500 text-center mt-10">
              No tickets in this group.
            </p>
          ) : (
            tickets.map((t) => (
              <TicketRow
                key={t.id}
                ticket={t}
                agents={agents}
                statuses={statuses}
                onTicketUpdated={onTicketUpdated}
              />
            ))
          )}
        </div>
      </div>
    </>
  );
}

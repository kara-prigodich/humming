import type {
  Ticket,
  Agent,
  TicketFieldsResponse,
  StatusChoice,
} from "./types";

const DOMAIN = process.env.FRESHSERVICE_DOMAIN;
const GROUP_ID = parseInt(process.env.FRESHSERVICE_WORKDAY_GROUP_ID || "0", 10);
const BASE_URL = `https://${DOMAIN}/api/v2`;

// FreshService standard status IDs
export const STANDARD_STATUSES = {
  OPEN: 2,
  PENDING: 3,
  RESOLVED: 4,
  CLOSED: 5,
} as const;

export const PRIORITY = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  URGENT: 4,
} as const;

export const WORKDAY_SR_PREFIX = "Workday Change Request:";

export function getWorkdayGroupId() {
  return GROUP_ID;
}

export function getAuthHeader(apiKey: string): string {
  const encoded = Buffer.from(`${apiKey}:X`).toString("base64");
  return `Basic ${encoded}`;
}

async function fsGet<T>(path: string, apiKey: string): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: {
      Authorization: getAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    // Disable Next.js caching so data is always fresh
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FreshService ${res.status} — ${path}: ${body}`);
  }

  return res.json() as Promise<T>;
}

async function fsPut<T>(
  path: string,
  apiKey: string,
  body: Record<string, unknown>
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: getAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FreshService PUT ${res.status} — ${path}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ─── Paginated fetch — collects all pages ────────────────────────────────────

async function fetchAllPages<T>(
  basePath: string,
  apiKey: string,
  dataKey: string
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const PER_PAGE = 30;

  while (true) {
    const sep = basePath.includes("?") ? "&" : "?";
    const data = await fsGet<Record<string, T[]>>(
      `${basePath}${sep}page=${page}&per_page=${PER_PAGE}`,
      apiKey
    );

    const items = (data[dataKey] as T[]) ?? [];
    results.push(...items);

    if (items.length < PER_PAGE) break;
    page++;
    if (page > 200) break; // safety limit
  }

  return results;
}

// ─── Public API helpers ───────────────────────────────────────────────────────

export async function getMe(apiKey: string): Promise<Agent> {
  const data = await fsGet<{ agent: Agent }>("/agents/me", apiKey);
  return data.agent;
}

/** All tickets belonging to the Workday group */
export async function getGroupTickets(apiKey: string): Promise<Ticket[]> {
  return fetchAllPages<Ticket>(
    `/tickets?group_id=${GROUP_ID}&include=requester,responder`,
    apiKey,
    "tickets"
  );
}

/** All agents from the FreshService instance, filtered to Workday group */
export async function getGroupAgents(apiKey: string): Promise<Agent[]> {
  // Fetch all active agents then filter to those who belong to the Workday group
  const all = await fetchAllPages<Agent>("/agents?active=true", apiKey, "agents");
  return all.filter(
    (a) => Array.isArray(a.group_ids) && a.group_ids.includes(GROUP_ID)
  );
}

/** Ticket field definitions — used to discover custom status IDs */
export async function getTicketFields(
  apiKey: string
): Promise<StatusChoice[]> {
  const data = await fsGet<TicketFieldsResponse>("/ticket_fields", apiKey);
  const statusField = data.ticket_fields.find(
    (f) => f.field_type === "default_status"
  );
  if (!statusField?.choices) return [];
  return statusField.choices.map(([id, label]) => ({ id, label }));
}

/** Update a ticket's status and/or assignee */
export async function updateTicket(
  id: number,
  apiKey: string,
  updates: { status?: number; responder_id?: number }
): Promise<Ticket> {
  const data = await fsPut<{ ticket: Ticket }>(
    `/tickets/${id}`,
    apiKey,
    updates
  );
  return data.ticket;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isWorkdaySR(ticket: Ticket): boolean {
  return (
    ticket.type === "Service Request" &&
    ticket.subject.startsWith(WORKDAY_SR_PREFIX)
  );
}

export function isUnresolved(ticket: Ticket): boolean {
  return (
    ticket.status !== STANDARD_STATUSES.RESOLVED &&
    ticket.status !== STANDARD_STATUSES.CLOSED
  );
}

export function isOverdue(ticket: Ticket): boolean {
  if (!ticket.due_by) return false;
  return new Date(ticket.due_by) < new Date() && isUnresolved(ticket);
}

export function agentName(agent: Agent): string {
  return `${agent.first_name} ${agent.last_name}`.trim();
}

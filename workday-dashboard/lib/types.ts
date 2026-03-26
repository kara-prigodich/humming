// ─── FreshService Entity Types ────────────────────────────────────────────────

export interface Agent {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  active: boolean;
  group_ids: number[];
}

export interface Ticket {
  id: number;
  subject: string;
  status: number;
  priority: number; // 1=Low 2=Medium 3=High 4=Urgent
  type: string; // "Incident" | "Service Request"
  responder_id: number | null;
  requester_id: number;
  group_id: number | null;
  created_at: string;
  updated_at: string;
  due_by: string | null;
  fr_due_by: string | null;
  is_escalated: boolean;
  category: string | null;
  sub_category: string | null;
  tags: string[];
}

// Ticket status choices from ticket_fields endpoint
export interface StatusChoice {
  id: number;
  label: string;
}

// ─── Session Types ────────────────────────────────────────────────────────────

export interface SessionAgent {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
}

export interface SessionData {
  apiKey?: string;
  agent?: SessionAgent;
}

// ─── Dashboard State Types ────────────────────────────────────────────────────

export interface AgentTicketSummary {
  agent: Agent;
  open: number;
  inProgress: number;
  pending: number;
  urgent: number;
  overdue: number;
  total: number;
  tickets: Ticket[];
}

export interface PipelineLane {
  id: string;
  label: string;
  color: string;
  tickets: Ticket[];
}

// ─── API Response Types ───────────────────────────────────────────────────────

export interface TicketsResponse {
  tickets: Ticket[];
}

export interface AgentsResponse {
  agents: Agent[];
}

export interface AgentResponse {
  agent: Agent;
}

export interface TicketFieldsResponse {
  ticket_fields: Array<{
    id: number;
    name: string;
    label: string;
    field_type: string;
    choices?: Array<[number, string]>;
  }>;
}

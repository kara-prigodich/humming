import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { updateTicket } from "@/lib/freshservice";

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session.apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const { id, status, responder_id } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Ticket ID required" }, { status: 400 });
    }

    const updates: { status?: number; responder_id?: number } = {};
    if (status !== undefined) updates.status = status;
    if (responder_id !== undefined) updates.responder_id = responder_id;

    const ticket = await updateTicket(id, session.apiKey, updates);
    return NextResponse.json({ ticket });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update ticket";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

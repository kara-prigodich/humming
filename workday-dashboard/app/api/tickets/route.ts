import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGroupTickets } from "@/lib/freshservice";

export async function GET() {
  const session = await getSession();
  if (!session.apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const tickets = await getGroupTickets(session.apiKey);
    return NextResponse.json({ tickets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch tickets";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

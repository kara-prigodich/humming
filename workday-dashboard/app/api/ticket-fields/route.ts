import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getTicketFields } from "@/lib/freshservice";

export async function GET() {
  const session = await getSession();
  if (!session.apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const statuses = await getTicketFields(session.apiKey);
    return NextResponse.json({ statuses });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch ticket fields";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

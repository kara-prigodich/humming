import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGroupAgents } from "@/lib/freshservice";

export async function GET() {
  const session = await getSession();
  if (!session.apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const agents = await getGroupAgents(session.apiKey);
    return NextResponse.json({ agents });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch agents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

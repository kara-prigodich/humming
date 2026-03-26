import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getGroupTickets, isWorkdaySR } from "@/lib/freshservice";

export async function GET() {
  const session = await getSession();
  if (!session.apiKey) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const all = await getGroupTickets(session.apiKey);
    const serviceRequests = all.filter(isWorkdaySR);
    return NextResponse.json({ serviceRequests });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to fetch service requests";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

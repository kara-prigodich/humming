import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getMe } from "@/lib/freshservice";

export async function POST(request: NextRequest) {
  try {
    const { apiKey } = await request.json();

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim() === "") {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    // Validate the key by resolving the agent identity
    const agent = await getMe(apiKey.trim());

    // Store in encrypted session cookie
    const session = await getSession();
    session.apiKey = apiKey.trim();
    session.agent = {
      id: agent.id,
      first_name: agent.first_name,
      last_name: agent.last_name,
      email: agent.email,
    };
    await session.save();

    return NextResponse.json({ agent: session.agent });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Login failed";
    // FreshService returns 401 for invalid keys
    const status = message.includes("401") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

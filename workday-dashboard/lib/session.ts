import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { SessionData } from "./types";

export const sessionOptions = {
  password:
    process.env.NEXTAUTH_SECRET ||
    "workday-dashboard-fallback-secret-32chars!!",
  cookieName: "workday-dashboard-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 8, // 8 hours
  },
};

export async function getSession() {
  const session = await getIronSession<SessionData>(
    cookies(),
    sessionOptions
  );
  return session;
}

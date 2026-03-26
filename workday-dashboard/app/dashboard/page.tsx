import { getSession } from "@/lib/session";
import DashboardClient from "./DashboardClient";

export default async function DashboardPage() {
  const session = await getSession();
  // Layout already guarantees agent exists
  const agent = session.agent!;
  return <DashboardClient agent={agent} />;
}

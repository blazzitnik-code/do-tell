import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase/server";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: allowed } = await sb.from("allowed_users").select("email").limit(1);
  if (!allowed?.length) {
    return (
      <div className="login"><h1>Do Tell.</h1><p>{user.email} is not on the invite list. Ask the owner to add you.</p></div>
    );
  }
  return <Dashboard />;
}

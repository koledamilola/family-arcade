import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { PeopleManager } from "./people-manager";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const { user } = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("created_at", { ascending: true });
  return <PeopleManager people={(data as Profile[] | null) ?? []} myId={user.id} />;
}

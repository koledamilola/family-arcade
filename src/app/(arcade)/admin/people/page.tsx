import type { Metadata } from "next";
import { requireParent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Invite, Profile } from "@/lib/types";
import { PeopleManager } from "./people-manager";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage(props: PageProps<"/admin/people">) {
  const params = await props.searchParams;
  const { user, family } = await requireParent();
  const supabase = await createClient();
  const [{ data: people }, { data: invites }] = await Promise.all([
    supabase.from("profiles").select("*").eq("family_id", family.id).order("created_at", { ascending: true }),
    supabase
      .from("family_invites")
      .select("*")
      .eq("family_id", family.id)
      .is("used_by", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);
  return (
    <PeopleManager
      familyName={family.name}
      people={(people as Profile[] | null) ?? []}
      invites={(invites as Invite[] | null) ?? []}
      myId={user.id}
      justCreated={params.welcome === "1"}
    />
  );
}

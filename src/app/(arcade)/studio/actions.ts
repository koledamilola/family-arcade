"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { AIUnavailable } from "@/lib/ai";
import { coachTurn, ownProject, shareToArcade } from "@/lib/studio/engine";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof AIUnavailable || e instanceof Error ? e.message : String(e),
});

export async function createProject(idea: string) {
  const member = await assertMember();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("studio_projects")
    .insert({ family_id: member.family.id, owner_id: member.user.id })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Couldn't start a project.");
  const firstIdea = idea.trim();
  if (firstIdea) {
    try {
      await coachTurn(member, await ownProject(member, data.id), firstIdea);
    } catch {
      // The project page shows the problem (e.g. no AI connected) when they try again.
    }
  }
  redirect(`/studio/${data.id}`);
}

export async function sendMessage(projectId: string, text: string): Promise<Result> {
  try {
    const member = await assertMember();
    const project = await ownProject(member, projectId);
    await coachTurn(member, project, text);
    revalidatePath(`/studio/${projectId}`);
    return { ok: true };
  } catch (e) {
    revalidatePath(`/studio/${projectId}`);
    return fail(e);
  }
}

export async function shareProject(projectId: string): Promise<Result<{ slug: string; status: string }>> {
  try {
    const member = await assertMember();
    const project = await ownProject(member, projectId);
    const res = await shareToArcade(member, project);
    revalidatePath("/", "layout");
    return { ok: true, data: res };
  } catch (e) {
    return fail(e);
  }
}

/** Makes an older version the newest one again (no AI, no cost). */
export async function restoreVersion(projectId: string, version: number): Promise<Result> {
  try {
    const member = await assertMember();
    const project = await ownProject(member, projectId);
    const admin = createAdminClient();
    const { data: old } = await admin.from("studio_versions").select("html, summary").eq("project_id", project.id).eq("version", version).maybeSingle();
    if (!old) throw new Error("That version doesn't exist.");
    const { data: last } = await admin.from("studio_versions").select("version").eq("project_id", project.id).order("version", { ascending: false }).limit(1).single();
    const next = (last?.version ?? 0) + 1;
    await admin.from("studio_versions").insert({ project_id: project.id, version: next, html: old.html, summary: `Back to version ${version}` });
    await admin.from("studio_messages").insert({ project_id: project.id, role: "system", kind: "note", content: `Went back to version ${version} (saved as version ${next}).`, data: { version: next } });
    revalidatePath(`/studio/${projectId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteProject(projectId: string): Promise<Result> {
  try {
    const member = await assertMember();
    const project = await ownProject(member, projectId);
    // The game on the arcade (if shared) stays; only the Studio project goes.
    await createAdminClient().from("studio_projects").delete().eq("id", project.id);
    revalidatePath("/studio");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

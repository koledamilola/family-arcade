import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Member } from "@/lib/auth";
import { runAI } from "@/lib/ai";
import { createAdminClient } from "@/lib/supabase/server";
import { COVER_COLORS, slugify } from "@/lib/catalog";
import { removeFolder } from "@/lib/cleanup";
import { GENRES, type GamePlan, buildSystem, changeSystem, coachSystem, planToText } from "./prompts";

export type Project = {
  id: string;
  family_id: string;
  owner_id: string;
  title: string;
  stage: "interview" | "plan" | "built";
  plan: GamePlan | null;
  game_id: string | null;
  created_at: string;
  updated_at: string;
};

export const LIMITS = { message: 500, change: 300, changes: 6 };

/** Loads a project the member may WORK on (only its maker). */
export async function ownProject(member: Member, projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw new Error("Project not found.");
  const { data } = await createAdminClient()
    .from("studio_projects")
    .select("*")
    .eq("id", projectId)
    .eq("owner_id", member.user.id)
    .eq("family_id", member.family.id)
    .maybeSingle<Project>();
  if (!data) throw new Error("Project not found.");
  return data;
}

async function saveMessage(
  admin: SupabaseClient,
  projectId: string,
  m: { role: "user" | "assistant" | "system"; kind?: string; content: string; data?: unknown; cost_usd?: number },
) {
  await admin.from("studio_messages").insert({ project_id: projectId, kind: "chat", ...m });
}

async function touch(admin: SupabaseClient, projectId: string, fields: Record<string, unknown> = {}) {
  await admin.from("studio_projects").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", projectId);
}

// ------------------------------------------------------------------ coach

type CoachReply = { status: "asking" | "plan" | "off_topic"; reply: string; suggestions: string[]; plan: GamePlan | null };

/** Pulls the JSON object out of the coach's answer, tolerating stray text or code fences. */
function parseCoach(text: string): CoachReply {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as Partial<CoachReply>;
    const plan = raw.status === "plan" && raw.plan ? cleanPlan(raw.plan) : null;
    return {
      status: plan ? "plan" : raw.status === "off_topic" ? "off_topic" : "asking",
      reply: String(raw.reply ?? "").slice(0, 1200) || "Tell me more about your game idea!",
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions.map(String).filter(Boolean).slice(0, 4).map((s) => s.slice(0, 60)) : [],
      plan,
    };
  } catch {
    return { status: "asking", reply: text.replace(/```[\s\S]*?```/g, "").trim().slice(0, 1200) || "Tell me more about your game idea!", suggestions: [], plan: null };
  }
}

function cleanPlan(p: Partial<GamePlan>): GamePlan {
  const s = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x, 160)).filter(Boolean).slice(0, 6) : []);
  return {
    title: s(p.title, 60) || "My Game",
    emoji: s(p.emoji, 8) || "🎮",
    pitch: s(p.pitch, 240),
    genre: GENRES.includes(String(p.genre)) ? String(p.genre) : "Other",
    player: s(p.player),
    goal: s(p.goal),
    danger: s(p.danger),
    controls_keyboard: s(p.controls_keyboard),
    controls_touch: s(p.controls_touch),
    look: s(p.look, 300),
    sounds: s(p.sounds),
    has_scores: p.has_scores !== false,
    score_label: s(p.score_label, 24) || "Score",
    lower_is_better: p.lower_is_better === true,
    difficulty: s(p.difficulty),
    first_version: list(p.first_version),
    later_ideas: list(p.later_ideas),
  };
}

/** One round of the interview: the maker says something, the coach replies (or writes the plan). */
export async function coachTurn(member: Member, project: Project, userText: string) {
  const text = userText.trim().slice(0, LIMITS.message);
  if (!text) throw new Error("Type something first!");
  const admin = createAdminClient();

  // Only the conversation itself is sent (not game code), so coaching stays cheap.
  const { data: history } = await admin
    .from("studio_messages")
    .select("role, kind, content, data")
    .eq("project_id", project.id)
    .in("kind", ["chat", "plan"])
    .order("id", { ascending: true })
    .limit(30);
  const messages = (history ?? [])
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.kind === "plan" && m.data ? `${m.content}\n\nPLAN:\n${JSON.stringify(m.data)}` : m.content,
    }));
  messages.push({ role: "user", content: text });

  await saveMessage(admin, project.id, { role: "user", content: text });
  const res = await runAI(member, "coach", {
    tier: "coach",
    system: coachSystem({ makerName: member.profile.display_name, isKid: member.profile.member_role === "kid", hasPlan: Boolean(project.plan) }),
    messages,
    maxTokens: 3000,
    effort: "low",
  });
  const reply = parseCoach(res.text);

  if (reply.plan) {
    await saveMessage(admin, project.id, { role: "assistant", kind: "plan", content: reply.reply, data: reply.plan, cost_usd: res.costUsd });
    await touch(admin, project.id, { plan: reply.plan, title: reply.plan.title, ...(project.stage === "interview" ? { stage: "plan" } : {}) });
  } else {
    await saveMessage(admin, project.id, {
      role: "assistant",
      content: reply.reply,
      data: { suggestions: reply.suggestions, off_topic: reply.status === "off_topic" },
      cost_usd: res.costUsd,
    });
    await touch(admin, project.id);
  }
  return reply;
}

// ------------------------------------------------------------------ building

/** Pulls "SUMMARY: ..." and the html block (or search/replace edits) out of the builder's answer. */
function parseBuild(text: string) {
  const summary = /SUMMARY:\s*(.+)/.exec(text)?.[1]?.trim().slice(0, 400) ?? "";
  const fence = /```html\s*\n([\s\S]*?)```/i.exec(text);
  let html = fence?.[1]?.trim() ?? null;
  if (!html) {
    // No closing fence (or no fence at all) but the document is there.
    const at = text.search(/<!doctype html|<html[\s>]/i);
    if (at !== -1 && /<\/html>/i.test(text)) html = text.slice(at, text.search(/<\/html>/i) + 7).trim();
  }
  const edits = [...text.matchAll(/<<<<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n?>>>>>>> REPLACE/g)].map((m) => ({
    search: m[1],
    replace: m[2],
  }));
  return { summary, html, edits };
}

function looksLikeGame(html: string) {
  return /<html[\s>]/i.test(html) && /<script[\s>]/i.test(html) && html.length > 800 && html.length < 600_000;
}

/** Applies search/replace edits. Falls back to matching with trailing spaces ignored. Returns null if any edit can't be placed. */
export function applyEdits(html: string, edits: { search: string; replace: string }[]) {
  let out = html;
  for (const { search, replace } of edits) {
    if (!search.trim()) return null;
    const at = out.indexOf(search);
    if (at !== -1 && out.indexOf(search, at + 1) === -1) {
      out = out.slice(0, at) + replace + out.slice(at + search.length);
      continue;
    }
    // Retry ignoring trailing whitespace on each line.
    const norm = (s: string) => s.replace(/[ \t]+$/gm, "");
    const nOut = norm(out);
    const nSearch = norm(search);
    const nAt = nOut.indexOf(nSearch);
    if (nAt === -1 || nOut.indexOf(nSearch, nAt + 1) !== -1) return null;
    out = nOut.slice(0, nAt) + replace + nOut.slice(nAt + nSearch.length);
  }
  return out;
}

export async function latestVersion(projectId: string) {
  const { data } = await createAdminClient()
    .from("studio_versions")
    .select("version, html, summary, created_at")
    .eq("project_id", projectId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle<{ version: number; html: string; summary: string; created_at: string }>();
  return data;
}

async function saveVersion(admin: SupabaseClient, project: Project, html: string, summary: string, cost: number, note: string) {
  const prev = await latestVersion(project.id);
  const version = (prev?.version ?? 0) + 1;
  const { error } = await admin.from("studio_versions").insert({ project_id: project.id, version, html, summary });
  if (error) throw new Error(error.message);
  await saveMessage(admin, project.id, { role: "assistant", kind: "build", content: summary || note, data: { version }, cost_usd: cost });
  await touch(admin, project.id, { stage: "built" });
  return version;
}

const BUILD_MAX_TOKENS = 24_000;

/** Builds version 1 from the agreed plan. */
export async function buildFromPlan(member: Member, project: Project, onText: (soFar: string) => void) {
  if (!project.plan) throw new Error("Make a plan with the coach first.");
  const admin = createAdminClient();
  await saveMessage(admin, project.id, { role: "user", kind: "note", content: project.stage === "built" ? "Rebuild the game from the plan" : "Build it!" });
  const res = await runAI(member, "build", {
    tier: "build",
    system: buildSystem(),
    messages: [{ role: "user", content: `Build this game.\n\n${planToText(project.plan)}` }],
    maxTokens: BUILD_MAX_TOKENS,
    effort: "medium",
    onText,
  });
  const { summary, html } = parseBuild(res.text);
  if (res.truncated || !html || !looksLikeGame(html)) {
    await saveMessage(admin, project.id, {
      role: "assistant",
      kind: "error",
      content: res.truncated
        ? "The game got too big to finish in one go. Try making the plan a little smaller, then build again."
        : "The builder didn't send back a working game this time. Press Build again.",
      cost_usd: res.costUsd,
    });
    throw new Error("The build didn't finish. Nothing was saved, but the attempt did use some credit.");
  }
  const version = await saveVersion(admin, project, html, summary, res.costUsd, "Your game is ready!");
  return { version, summary, cost: res.costUsd };
}

/** Applies a batch of changes to the latest version, as small edits where possible. */
export async function applyChanges(member: Member, project: Project, changes: string[], onText: (soFar: string) => void) {
  const list = changes.map((c) => c.trim().slice(0, LIMITS.change)).filter(Boolean).slice(0, LIMITS.changes);
  if (!list.length) throw new Error("Add at least one change.");
  const current = await latestVersion(project.id);
  if (!current) throw new Error("Build the game first.");
  const admin = createAdminClient();
  await saveMessage(admin, project.id, { role: "user", kind: "note", content: list.map((c) => `• ${c}`).join("\n"), data: { changes: list } });

  const res = await runAI(member, "change", {
    tier: "build",
    system: changeSystem(),
    messages: [
      {
        role: "user",
        content: `GAME PLAN (for context):\n${project.plan ? planToText(project.plan) : "(none)"}\n\nCURRENT FILE:\n\`\`\`html\n${current.html}\n\`\`\`\n\nCHANGES TO MAKE:\n${list.map((c, i) => `${i + 1}. ${c}`).join("\n")}`,
      },
    ],
    maxTokens: BUILD_MAX_TOKENS,
    effort: "medium",
    onText,
  });
  const parsed = parseBuild(res.text);
  let html: string | null = null;
  if (parsed.edits.length) html = applyEdits(current.html, parsed.edits);
  if (!html && parsed.html) html = parsed.html;
  if (res.truncated || !html || !looksLikeGame(html)) {
    await saveMessage(admin, project.id, {
      role: "assistant",
      kind: "error",
      content: "Those changes didn't fit into the game cleanly, so I kept your game as it was. Try fewer or simpler changes at once.",
      cost_usd: res.costUsd,
    });
    throw new Error("The changes couldn't be applied. Your game is unchanged.");
  }
  const version = await saveVersion(admin, project, html, parsed.summary, res.costUsd, "Changes made!");
  return { version, summary: parsed.summary, cost: res.costUsd };
}

// ------------------------------------------------------------------ cost estimates

/** Rough cost (USD) of the next coach message, a fresh build, and a change batch, from the family's prices. */
export function estimates(prices: { coach: { in: number; out: number }; build: { in: number; out: number } }, htmlLength: number) {
  const usd = (tokIn: number, tokOut: number, p: { in: number; out: number }) => (tokIn * p.in + tokOut * p.out) / 1_000_000;
  const htmlTokens = Math.ceil(htmlLength / 3.5);
  return {
    message: usd(2500, 600, prices.coach),
    build: usd(2500, 11_000, prices.build),
    /** Per change batch: reads the whole game once, writes small edits. */
    changes: (n: number) => usd(2000 + htmlTokens, 900 + 700 * n, prices.build),
  };
}

// ------------------------------------------------------------------ sharing to the arcade

/**
 * Puts the latest version on the family arcade. Kids' games go to the parents'
 * approval queue (status "pending"); grown-ups' games go live straight away.
 */
export async function shareToArcade(member: Member, project: Project) {
  const current = await latestVersion(project.id);
  if (!current) throw new Error("Build the game first.");
  const plan = project.plan;
  const admin = createAdminClient();
  const isKid = member.profile.member_role === "kid";

  const prefix = crypto.randomUUID();
  const { error: upErr } = await admin.storage
    .from("games")
    .upload(`${prefix}/index.html`, new Blob([current.html], { type: "text/html" }), { contentType: "text/html", cacheControl: "300" });
  if (upErr) throw new Error(`Couldn't upload the game: ${upErr.message}`);

  const row = {
    title: (plan?.title ?? project.title).slice(0, 80),
    description: plan?.pitch ?? "",
    creator_name: member.profile.display_name,
    category: plan?.genre ?? "Other",
    controls: plan ? [plan.controls_keyboard, plan.controls_touch && `Touch: ${plan.controls_touch}`].filter(Boolean).join("\n") : "",
    cover_emoji: plan?.emoji ?? "🎮",
    kind: "html" as const,
    storage_prefix: prefix,
    entry_path: "index.html",
    has_scores: plan?.has_scores ?? false,
    score_label: plan?.score_label ?? "Score",
    lower_is_better: plan?.lower_is_better ?? false,
    supports_touch: true,
    status: isKid ? "pending" : "published",
    review_note: null,
    updated_at: new Date().toISOString(),
  };

  let gameId = project.game_id;
  let slug: string;
  const existing = gameId
    ? (await admin.from("games").select("id, slug, storage_prefix").eq("id", gameId).eq("family_id", member.family.id).maybeSingle()).data
    : null;

  if (existing) {
    const { error } = await admin.from("games").update(row).eq("id", existing.id);
    if (error) throw new Error(error.message);
    if (existing.storage_prefix && existing.storage_prefix !== prefix) await removeFolder(admin, "games", existing.storage_prefix);
    slug = existing.slug;
  } else {
    const base = slugify(row.title);
    slug = base;
    for (let n = 2; ; n++) {
      const { count } = await admin.from("games").select("id", { count: "exact", head: true }).eq("family_id", member.family.id).eq("slug", slug);
      if (!count) break;
      slug = `${base}-${n}`;
    }
    const colors = Object.keys(COVER_COLORS);
    const { data, error } = await admin
      .from("games")
      .insert({ ...row, slug, family_id: member.family.id, created_by: member.user.id, cover_color: colors[Math.floor(Math.random() * colors.length)] })
      .select("id")
      .single();
    if (error || !data) {
      await removeFolder(admin, "games", prefix);
      throw new Error(error?.message ?? "Couldn't add the game.");
    }
    gameId = data.id;
  }

  await touch(admin, project.id, { game_id: gameId });
  await saveMessage(admin, project.id, {
    role: "system",
    kind: "note",
    content: isKid ? `Version ${current.version} was sent to a parent for approval.` : `Version ${current.version} is now on the family arcade!`,
  });
  return { slug, status: row.status };
}

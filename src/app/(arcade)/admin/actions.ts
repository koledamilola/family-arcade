"use server";

import { revalidatePath } from "next/cache";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PIN_RE,
  USERNAME_RE,
  assertParent,
  kidEmail,
  kidPassword,
  normalizeUsername,
} from "@/lib/auth";
import { CATEGORIES, COVER_COLORS, slugify } from "@/lib/catalog";
import { removeFolder, removeGameFiles, thumbnailPath } from "@/lib/cleanup";
import { createAdminClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/origin";
import type { GameKind } from "@/lib/types";

// Every action here runs with the secret key (no security rules), so each one
// first checks the visitor is a parent and that the thing they're changing
// belongs to THEIR family.

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

function cleanPath(p: string) {
  const parts = p.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Bad file path: ${p}`);
  return parts.join("/");
}

async function parent() {
  const member = await assertParent();
  return { member, familyId: member.family.id, admin: createAdminClient() };
}

async function familyGame(admin: SupabaseClient, familyId: string, id: string) {
  const { data } = await admin
    .from("games")
    .select("id, slug, status, storage_prefix, thumbnail_url")
    .eq("id", id)
    .eq("family_id", familyId)
    .maybeSingle();
  if (!data) throw new Error("That game isn't in your family.");
  return data;
}

async function familyMember(admin: SupabaseClient, familyId: string, userId: string) {
  const { data } = await admin
    .from("profiles")
    .select("id, member_role, username, display_name")
    .eq("id", userId)
    .eq("family_id", familyId)
    .maybeSingle();
  if (!data) throw new Error("That person isn't in your family.");
  return data as { id: string; member_role: string; username: string | null; display_name: string };
}

function refresh() {
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------- uploads

/** Gives the browser permission to upload a set of game files into a new folder. */
export async function prepareGameUpload(paths: string[]): Promise<Result<{ prefix: string; uploads: { path: string; token: string }[] }>> {
  try {
    const { admin } = await parent();
    if (paths.length === 0) throw new Error("No files to upload.");
    if (paths.length > 2000) throw new Error("That's a lot of files! Max 2000 per game.");
    const prefix = crypto.randomUUID();
    const clean = paths.map(cleanPath);
    const uploads: { path: string; token: string }[] = [];
    for (let i = 0; i < clean.length; i += 20) {
      const batch = await Promise.all(
        clean.slice(i, i + 20).map(async (path) => {
          const { data, error } = await admin.storage.from("games").createSignedUploadUrl(`${prefix}/${path}`);
          if (error || !data) throw new Error(error?.message ?? "Upload setup failed");
          return { path, token: data.token };
        }),
      );
      uploads.push(...batch);
    }
    return { ok: true, data: { prefix, uploads } };
  } catch (e) {
    return fail(e);
  }
}

export async function prepareThumbnailUpload(ext: string): Promise<Result<{ path: string; token: string; publicUrl: string }>> {
  try {
    const { admin } = await parent();
    const safeExt = /^(png|jpe?g|gif|webp|avif)$/i.test(ext) ? ext.toLowerCase() : "png";
    const path = `${crypto.randomUUID()}.${safeExt}`;
    const { data, error } = await admin.storage.from("thumbnails").createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "Upload setup failed");
    const publicUrl = admin.storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
    return { ok: true, data: { path, token: data.token, publicUrl } };
  } catch (e) {
    return fail(e);
  }
}

/** Removes files that were uploaded but never saved (e.g. the form was cancelled). */
export async function discardUpload(prefix: string): Promise<Result> {
  try {
    const { admin } = await parent();
    if (!/^[0-9a-f-]{36}$/i.test(prefix)) throw new Error("Bad folder");
    const { count } = await admin.from("games").select("id", { count: "exact", head: true }).eq("storage_prefix", prefix);
    if (!count) await removeFolder(admin, "games", prefix);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- games

export type GameInput = {
  id?: string;
  title: string;
  description: string;
  creator_name: string;
  category: string;
  controls: string;
  cover_emoji: string;
  cover_color: string;
  thumbnail_url: string | null;
  kind: GameKind;
  storage_prefix: string | null;
  entry_path: string | null;
  external_url: string | null;
  has_scores: boolean;
  score_label: string;
  lower_is_better: boolean;
  supports_touch: boolean;
  supports_gamepad: boolean;
  /** Show on the family arcade (published) or keep it hidden. */
  published: boolean;
};

export async function saveGame(input: GameInput): Promise<Result<{ id: string; slug: string }>> {
  try {
    const { member, familyId, admin } = await parent();

    const title = input.title.trim().slice(0, 80);
    if (!title) throw new Error("Every game needs a title.");
    if (!["html", "zip", "url"].includes(input.kind)) throw new Error("Unknown game type.");
    if (input.kind === "url") {
      const u = new URL(input.external_url ?? "");
      if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("The game link must start with https://");
      // Linked games get "allow-same-origin" in their sandbox, which is only safe
      // for other websites. A page on this site would get full access to it.
      if (u.origin === new URL(await getOrigin()).origin) {
        throw new Error("Games on this site must be uploaded, not linked.");
      }
    } else if (!input.storage_prefix || !/^[0-9a-f-]{36}$/i.test(input.storage_prefix) || !input.entry_path) {
      throw new Error("Please upload the game files.");
    }

    const row = {
      title,
      description: input.description.trim().slice(0, 2000),
      creator_name: input.creator_name.trim().slice(0, 60),
      category: CATEGORIES.some((c) => c.name === input.category) ? input.category : "Other",
      controls: input.controls.trim().slice(0, 1000),
      cover_emoji: input.cover_emoji.trim().slice(0, 16) || "🎮",
      cover_color: input.cover_color in COVER_COLORS ? input.cover_color : "sky",
      thumbnail_url: input.thumbnail_url,
      kind: input.kind,
      storage_prefix: input.kind === "url" ? null : input.storage_prefix,
      entry_path: input.kind === "url" ? null : cleanPath(input.entry_path ?? "index.html"),
      external_url: input.kind === "url" ? input.external_url!.trim() : null,
      has_scores: input.has_scores,
      score_label: input.score_label.trim().slice(0, 24) || "Score",
      lower_is_better: input.lower_is_better,
      supports_touch: input.supports_touch,
      supports_gamepad: input.supports_gamepad,
      status: input.published ? "published" : "hidden",
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const old = await familyGame(admin, familyId, input.id);
      const { error } = await admin.from("games").update({ ...row, review_note: null }).eq("id", input.id);
      if (error) throw new Error(error.message);
      if (old.storage_prefix && old.storage_prefix !== row.storage_prefix) {
        await removeFolder(admin, "games", old.storage_prefix);
      }
      const oldThumb = thumbnailPath(old.thumbnail_url);
      if (oldThumb && old.thumbnail_url !== row.thumbnail_url) {
        await admin.storage.from("thumbnails").remove([oldThumb]);
      }
      refresh();
      return { ok: true, data: { id: input.id, slug: old.slug } };
    }

    // New game: find a free web address (slug) within this family.
    const base = slugify(title);
    let slug = base;
    for (let n = 2; ; n++) {
      const { count } = await admin
        .from("games")
        .select("id", { count: "exact", head: true })
        .eq("family_id", familyId)
        .eq("slug", slug);
      if (!count) break;
      slug = `${base}-${n}`;
    }
    const { data, error } = await admin
      .from("games")
      .insert({ ...row, slug, family_id: familyId, created_by: member.user.id })
      .select("id, slug")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not save the game.");
    refresh();
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function setGamePublished(id: string, published: boolean): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    await familyGame(admin, familyId, id);
    const { error } = await admin
      .from("games")
      .update({ status: published ? "published" : "hidden", review_note: null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteGame(id: string): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    const game = await familyGame(admin, familyId, id);
    const { error } = await admin.from("games").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await removeGameFiles(admin, [game]);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function clearScores(gameId: string): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    await familyGame(admin, familyId, gameId);
    const { error } = await admin.from("scores").delete().eq("game_id", gameId);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- approvals

export async function approveGame(id: string): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    const game = await familyGame(admin, familyId, id);
    if (game.status !== "pending") throw new Error("That game isn't waiting for approval.");
    const { error } = await admin.from("games").update({ status: "published", review_note: null }).eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectGame(id: string, note: string): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    const game = await familyGame(admin, familyId, id);
    if (game.status !== "pending") throw new Error("That game isn't waiting for approval.");
    const { error } = await admin
      .from("games")
      .update({ status: "rejected", review_note: note.trim().slice(0, 500) || null })
      .eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- share links

export async function setShareEnabled(id: string, enabled: boolean): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    await familyGame(admin, familyId, id);
    const { error } = await admin.from("games").update({ share_enabled: enabled }).eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Makes a new share link, so the old one stops working. */
export async function newShareLink(id: string): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    await familyGame(admin, familyId, id);
    const { error } = await admin
      .from("games")
      .update({ share_token: crypto.randomUUID().replace(/-/g, ""), share_enabled: true })
      .eq("id", id);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- family & people

export async function renameFamily(name: string): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    const clean = name.trim().slice(0, 60);
    if (!clean) throw new Error("Your family needs a name.");
    const { error } = await admin.from("families").update({ name: clean }).eq("id", familyId);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// No 0/O or 1/I/L, so codes are easy to read out loud.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_DAYS = 7;

export async function createInvite(role: "parent" | "adult"): Promise<Result<{ code: string }>> {
  try {
    const { member, familyId, admin } = await parent();
    if (role !== "parent" && role !== "adult") throw new Error("Unknown role.");
    const code = Array.from({ length: 10 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const { error } = await admin.from("family_invites").insert({
      code,
      family_id: familyId,
      role,
      created_by: member.user.id,
      expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
    });
    if (error) throw new Error(error.message);
    revalidatePath("/admin/people");
    return { ok: true, data: { code } };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInvite(code: string): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    const { error } = await admin.from("family_invites").delete().eq("code", code).eq("family_id", familyId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/people");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setMemberRole(userId: string, role: "parent" | "adult"): Promise<Result> {
  try {
    const { member, familyId, admin } = await parent();
    if (role !== "parent" && role !== "adult") throw new Error("Unknown role.");
    if (userId === member.user.id) throw new Error("You can't change your own role.");
    const target = await familyMember(admin, familyId, userId);
    if (target.member_role === "kid") throw new Error("Kids can't be made grown-ups. Invite them with their own email instead.");
    const { error } = await admin.from("profiles").update({ member_role: role }).eq("id", userId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/people");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateProfile(userId: string, fields: { display_name: string; avatar_emoji: string }): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    await familyMember(admin, familyId, userId);
    const display_name = fields.display_name.trim().slice(0, 40);
    if (!display_name) throw new Error("Name can't be empty.");
    const { error } = await admin
      .from("profiles")
      .update({ display_name, avatar_emoji: fields.avatar_emoji.slice(0, 16) || "🙂" })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Kids: deletes the kid's account (their login only exists for this family).
 * Grown-ups: takes them out of the family; they keep their login and can be invited again.
 */
export async function removeMember(userId: string): Promise<Result> {
  try {
    const { member, familyId, admin } = await parent();
    if (userId === member.user.id) throw new Error("You can't remove yourself here. Use My account instead.");
    const target = await familyMember(admin, familyId, userId);
    if (target.member_role === "kid") {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(error.message);
      if (target.username) await admin.from("kid_login_failures").delete().eq("username", target.username);
    } else {
      const { error } = await admin.from("profiles").update({ family_id: null, member_role: null }).eq("id", userId);
      if (error) throw new Error(error.message);
    }
    revalidatePath("/admin/people");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createKidAccount(input: {
  display_name: string;
  username: string;
  pin: string;
  avatar_emoji: string;
}): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    const username = normalizeUsername(input.username);
    const display_name = input.display_name.trim().slice(0, 40);
    if (!display_name) throw new Error("Please add the kid's name.");
    if (!USERNAME_RE.test(username)) {
      throw new Error("Usernames are 3-20 characters: lowercase letters, numbers and _ only.");
    }
    if (!PIN_RE.test(input.pin)) throw new Error("PINs are 4 to 8 numbers.");
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("username", username);
    if (count) throw new Error("That username is taken. Try another!");

    const { data, error } = await admin.auth.admin.createUser({
      email: kidEmail(username),
      password: kidPassword(input.pin),
      email_confirm: true,
      user_metadata: { display_name },
    });
    if (error || !data.user) {
      throw new Error(error?.message.includes("already") ? "That username is taken. Try another!" : error?.message ?? "Could not create the account.");
    }

    const { error: pErr } = await admin.from("profiles").upsert({
      id: data.user.id,
      family_id: familyId,
      member_role: "kid",
      display_name,
      username,
      avatar_emoji: input.avatar_emoji || "🙂",
      email: null,
    });
    if (pErr) {
      await admin.auth.admin.deleteUser(data.user.id);
      throw new Error(pErr.message);
    }
    revalidatePath("/admin/people");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetKidPin(userId: string, pin: string): Promise<Result> {
  try {
    const { familyId, admin } = await parent();
    if (!PIN_RE.test(pin)) throw new Error("PINs are 4 to 8 numbers.");
    const kid = await familyMember(admin, familyId, userId);
    if (kid.member_role !== "kid") throw new Error("Only kid accounts use PINs.");
    const { error } = await admin.auth.admin.updateUserById(userId, { password: kidPassword(pin) });
    if (error) throw new Error(error.message);
    // A fresh PIN also lifts any wrong-PIN lockout.
    if (kid.username) await admin.from("kid_login_failures").delete().eq("username", kid.username);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

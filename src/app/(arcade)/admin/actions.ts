"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PIN_RE,
  USERNAME_RE,
  assertAdmin,
  kidEmail,
  kidPassword,
  normalizeUsername,
} from "@/lib/auth";
import { CATEGORIES, COVER_COLORS, slugify } from "@/lib/catalog";
import { createAdminClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/origin";
import type { GameKind, Role } from "@/lib/types";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

function cleanPath(p: string) {
  const parts = p.replace(/\\/g, "/").split("/").filter((s) => s && s !== ".");
  if (parts.some((s) => s === "..")) throw new Error(`Bad file path: ${p}`);
  return parts.join("/");
}

// ---------------------------------------------------------------- uploads

/** Gives the browser permission to upload a set of game files into a new folder. */
export async function prepareGameUpload(paths: string[]): Promise<Result<{ prefix: string; uploads: { path: string; token: string }[] }>> {
  try {
    await assertAdmin();
    if (paths.length === 0) throw new Error("No files to upload.");
    if (paths.length > 2000) throw new Error("That's a lot of files! Max 2000 per game.");
    const admin = createAdminClient();
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
    await assertAdmin();
    const safeExt = /^(png|jpe?g|gif|webp|avif)$/i.test(ext) ? ext.toLowerCase() : "png";
    const admin = createAdminClient();
    const path = `${crypto.randomUUID()}.${safeExt}`;
    const { data, error } = await admin.storage.from("thumbnails").createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "Upload setup failed");
    const publicUrl = admin.storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
    return { ok: true, data: { path, token: data.token, publicUrl } };
  } catch (e) {
    return fail(e);
  }
}

async function removeFolder(admin: SupabaseClient, bucket: string, folder: string) {
  const files: string[] = [];
  async function walk(dir: string) {
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000, offset });
      if (error || !data) return;
      for (const item of data) {
        const full = `${dir}/${item.name}`;
        if (item.id === null) await walk(full);
        else files.push(full);
      }
      if (data.length < 1000) return;
      offset += data.length;
    }
  }
  await walk(folder);
  for (let i = 0; i < files.length; i += 500) {
    await admin.storage.from(bucket).remove(files.slice(i, i + 500));
  }
}

function thumbnailPath(url: string | null | undefined) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/thumbnails/";
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
}

/** Removes files that were uploaded but never saved (e.g. the form was cancelled). */
export async function discardUpload(prefix: string): Promise<Result> {
  try {
    await assertAdmin();
    if (!/^[0-9a-f-]{36}$/i.test(prefix)) throw new Error("Bad folder");
    const admin = createAdminClient();
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
  published: boolean;
};

export async function saveGame(input: GameInput): Promise<Result<{ id: string; slug: string }>> {
  try {
    const { user } = await assertAdmin();
    const admin = createAdminClient();

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
    } else if (!input.storage_prefix || !input.entry_path) {
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
      published: input.published,
      updated_at: new Date().toISOString(),
    };

    if (input.id) {
      const { data: old } = await admin.from("games").select("storage_prefix, thumbnail_url, slug").eq("id", input.id).single();
      const { error } = await admin.from("games").update(row).eq("id", input.id);
      if (error) throw new Error(error.message);
      if (old?.storage_prefix && old.storage_prefix !== row.storage_prefix) {
        await removeFolder(admin, "games", old.storage_prefix);
      }
      const oldThumb = thumbnailPath(old?.thumbnail_url);
      if (oldThumb && old?.thumbnail_url !== row.thumbnail_url) {
        await admin.storage.from("thumbnails").remove([oldThumb]);
      }
      revalidatePath("/", "layout");
      return { ok: true, data: { id: input.id, slug: old?.slug ?? "" } };
    }

    // New game: find a free web address (slug).
    const base = slugify(title);
    let slug = base;
    for (let n = 2; ; n++) {
      const { count } = await admin.from("games").select("id", { count: "exact", head: true }).eq("slug", slug);
      if (!count) break;
      slug = `${base}-${n}`;
    }
    const { data, error } = await admin
      .from("games")
      .insert({ ...row, slug, created_by: user.id })
      .select("id, slug")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not save the game.");
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (e) {
    return fail(e);
  }
}

export async function setGamePublished(id: string, published: boolean): Promise<Result> {
  try {
    await assertAdmin();
    const { error } = await createAdminClient().from("games").update({ published }).eq("id", id);
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteGame(id: string): Promise<Result> {
  try {
    await assertAdmin();
    const admin = createAdminClient();
    const { data: game } = await admin.from("games").select("storage_prefix, thumbnail_url").eq("id", id).single();
    const { error } = await admin.from("games").delete().eq("id", id);
    if (error) throw new Error(error.message);
    if (game?.storage_prefix) await removeFolder(admin, "games", game.storage_prefix);
    const thumb = thumbnailPath(game?.thumbnail_url);
    if (thumb) await admin.storage.from("thumbnails").remove([thumb]);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function clearScores(gameId: string): Promise<Result> {
  try {
    await assertAdmin();
    const { error } = await createAdminClient().from("scores").delete().eq("game_id", gameId);
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ---------------------------------------------------------------- people

export async function setRole(userId: string, role: Role): Promise<Result> {
  try {
    const { user } = await assertAdmin();
    if (!["pending", "player", "admin"].includes(role)) throw new Error("Unknown role.");
    if (userId === user.id && role !== "admin") throw new Error("You can't remove your own admin powers.");
    const { error } = await createAdminClient().from("profiles").update({ role }).eq("id", userId);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/people");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateProfile(userId: string, fields: { display_name: string; avatar_emoji: string }): Promise<Result> {
  try {
    await assertAdmin();
    const display_name = fields.display_name.trim().slice(0, 40);
    if (!display_name) throw new Error("Name can't be empty.");
    const { error } = await createAdminClient()
      .from("profiles")
      .update({ display_name, avatar_emoji: fields.avatar_emoji.slice(0, 16) || "🙂" })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteUser(userId: string): Promise<Result> {
  try {
    const { user } = await assertAdmin();
    if (userId === user.id) throw new Error("You can't delete yourself.");
    const { error } = await createAdminClient().auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
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
    await assertAdmin();
    const username = normalizeUsername(input.username);
    const display_name = input.display_name.trim().slice(0, 40);
    if (!display_name) throw new Error("Please add the kid's name.");
    if (!USERNAME_RE.test(username)) {
      throw new Error("Usernames are 3-20 characters: lowercase letters, numbers and _ only.");
    }
    if (!PIN_RE.test(input.pin)) throw new Error("PINs are 4 to 8 numbers.");
    const admin = createAdminClient();
    const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("username", username);
    if (count) throw new Error("That username is taken. Try another!");

    const { data, error } = await admin.auth.admin.createUser({
      email: kidEmail(username),
      password: kidPassword(input.pin),
      email_confirm: true,
      user_metadata: { display_name },
    });
    if (error || !data.user) throw new Error(error?.message ?? "Could not create the account.");

    const { error: pErr } = await admin.from("profiles").upsert({
      id: data.user.id,
      display_name,
      username,
      avatar_emoji: input.avatar_emoji || "🙂",
      role: "player",
      is_kid: true,
      email: null,
    });
    if (pErr) throw new Error(pErr.message);
    revalidatePath("/admin/people");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function resetKidPin(userId: string, pin: string): Promise<Result> {
  try {
    await assertAdmin();
    if (!PIN_RE.test(pin)) throw new Error("PINs are 4 to 8 numbers.");
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_kid, username").eq("id", userId).single();
    if (!profile?.is_kid) throw new Error("Only kid accounts use PINs.");
    const { error } = await admin.auth.admin.updateUserById(userId, { password: kidPassword(pin) });
    if (error) throw new Error(error.message);
    // A fresh PIN also lifts any wrong-PIN lockout.
    if (profile.username) await admin.from("kid_login_failures").delete().eq("username", profile.username);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

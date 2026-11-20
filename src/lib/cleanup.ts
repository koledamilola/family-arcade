import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Deletes every file under a folder in a storage bucket. */
export async function removeFolder(admin: SupabaseClient, bucket: string, folder: string) {
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

/** The storage path of an uploaded cover picture, from its public URL. */
export function thumbnailPath(url: string | null | undefined) {
  if (!url) return null;
  const marker = "/storage/v1/object/public/thumbnails/";
  const at = url.indexOf(marker);
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length));
}

/** Removes the uploaded files (game folder + cover) that belong to some games. */
export async function removeGameFiles(
  admin: SupabaseClient,
  games: { storage_prefix: string | null; thumbnail_url: string | null }[],
) {
  for (const g of games) {
    if (g.storage_prefix) await removeFolder(admin, "games", g.storage_prefix);
  }
  const thumbs = games.map((g) => thumbnailPath(g.thumbnail_url)).filter((p): p is string => Boolean(p));
  if (thumbs.length) await admin.storage.from("thumbnails").remove(thumbs);
}

/**
 * Deletes a family completely: every member's login, every game and its files.
 * The caller must already have checked permission.
 */
export async function deleteFamilyCompletely(admin: SupabaseClient, familyId: string) {
  const [{ data: games }, { data: members }] = await Promise.all([
    admin.from("games").select("storage_prefix, thumbnail_url").eq("family_id", familyId),
    admin.from("profiles").select("id, username").eq("family_id", familyId),
  ]);
  await removeGameFiles(admin, games ?? []);
  for (const m of members ?? []) {
    const { error } = await admin.auth.admin.deleteUser(m.id);
    if (error) throw new Error(`Couldn't delete a member's login: ${error.message}`);
    if (m.username) await admin.from("kid_login_failures").delete().eq("username", m.username);
  }
  const { error } = await admin.from("families").delete().eq("id", familyId);
  if (error) throw new Error(error.message);
}

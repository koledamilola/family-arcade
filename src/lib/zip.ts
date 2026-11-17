"use client";

import { unzip } from "fflate";
import { isHtml } from "@/lib/mime";

export type GameFile = { path: string; data: Blob };

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\.git)(\/|$)/i;

/** Unpacks a .zip in the browser and works out which page starts the game. */
export async function readGameZip(file: File): Promise<{ files: GameFile[]; entry: string }> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const entries = await new Promise<Record<string, Uint8Array>>((resolve, reject) =>
    unzip(buf, (err, data) => (err ? reject(err) : resolve(data))),
  );

  let files = Object.entries(entries)
    .filter(([path, data]) => !path.endsWith("/") && !JUNK.test(path) && data.length >= 0)
    .map(([path, data]) => ({ path: path.replace(/\\/g, "/").replace(/^\/+/, ""), data }));

  if (files.length === 0) throw new Error("That zip file is empty.");

  // If everything sits inside one folder (e.g. "my-game/index.html"), drop that folder.
  const firstSegments = new Set(files.map((f) => f.path.split("/")[0]));
  if (firstSegments.size === 1 && files.every((f) => f.path.includes("/"))) {
    const root = [...firstSegments][0] + "/";
    files = files.map((f) => ({ ...f, path: f.path.slice(root.length) }));
  }

  const htmls = files.map((f) => f.path).filter(isHtml);
  if (htmls.length === 0) throw new Error("No .html file found in the zip. Games need an index.html to start.");
  const depth = (p: string) => p.split("/").length;
  const entry =
    htmls.filter((p) => /(^|\/)index\.html?$/i.test(p)).sort((a, b) => depth(a) - depth(b))[0] ??
    htmls.sort((a, b) => depth(a) - depth(b))[0];

  return {
    entry,
    files: files.map((f) => ({ path: f.path, data: new Blob([f.data as BlobPart]) })),
  };
}

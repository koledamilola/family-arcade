const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  cjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
  csv: "text/csv",
  wasm: "application/wasm",
  data: "application/octet-stream",
  pck: "application/octet-stream",
  bin: "application/octet-stream",
  unityweb: "application/octet-stream",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  flac: "audio/flac",
  weba: "audio/webm",
  mp4: "video/mp4",
  webm: "video/webm",
  ogv: "video/ogg",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  atlas: "text/plain; charset=utf-8",
  fnt: "text/plain; charset=utf-8",
  tmx: "application/xml",
  tsx: "application/xml",
};

export function extensionOf(path: string) {
  const name = path.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

export function mimeFor(path: string) {
  return TYPES[extensionOf(path)] ?? "application/octet-stream";
}

export function isHtml(path: string) {
  const ext = extensionOf(path);
  return ext === "html" || ext === "htm";
}

import { assertMember } from "@/lib/auth";
import { AIUnavailable } from "@/lib/ai";
import { LIMITS, applyChanges, buildFromPlan, ownProject } from "@/lib/studio/engine";

// Builds can take a couple of minutes, so this streams progress back as
// newline-delimited JSON: {"t":"progress","chars":N} ... then {"t":"done",...} or {"t":"error",...}.
export const maxDuration = 300;

export async function POST(request: Request, ctx: RouteContext<"/api/studio/[id]/build">) {
  const { id } = await ctx.params;
  let body: { mode?: string; changes?: unknown } = {};
  try {
    body = await request.json();
  } catch {}

  let member;
  let project;
  try {
    member = await assertMember();
    project = await ownProject(member, id);
  } catch (e) {
    return Response.json({ t: "error", message: e instanceof Error ? e.message : "Not allowed." }, { status: 403 });
  }

  const changes = Array.isArray(body.changes) ? body.changes.map(String).slice(0, LIMITS.changes) : [];
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let last = 0;
      const onText = (soFar: string) => {
        const now = Date.now();
        if (now - last > 400) {
          last = now;
          send({ t: "progress", chars: soFar.length });
        }
      };
      try {
        send({ t: "progress", chars: 0 });
        const result =
          body.mode === "changes" ? await applyChanges(member, project, changes, onText) : await buildFromPlan(member, project, onText);
        send({ t: "done", ...result });
      } catch (e) {
        send({ t: "error", message: e instanceof AIUnavailable || e instanceof Error ? e.message : "Something went wrong." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}

import { deadlineFrom, runCollect } from "@/lib/jobs/collect";
import { maskKey } from "@/lib/kipris/client";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 전체 수집 (수동). body: {dryRun?: boolean} */
export async function POST(req: Request) {
  const started = Date.now();
  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  try {
    return Response.json(await runCollect({ dryRun: !!body.dryRun, deadline: deadlineFrom(maxDuration, started) }));
  } catch (e) {
    return Response.json({ error: maskKey(e instanceof Error ? e.message : String(e)) }, { status: 502 });
  }
}

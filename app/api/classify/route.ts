import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/db/queries";
import { deadlineFrom } from "@/lib/jobs/collect";
import { classifyPending } from "@/lib/jobs/classify";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 미분류 건 일괄 분류. body: {limit?: number} */
export async function POST(req: Request) {
  const started = Date.now();
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const db = await getDb();
  const settings = await getSettings(db);
  try {
    const r = await classifyPending(db, {
      limit: Math.min(Math.max(body.limit ?? 30, 1), 200),
      deadline: deadlineFrom(maxDuration, started),
      highMax: settings.high_max_elements,
    });
    return Response.json(r);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

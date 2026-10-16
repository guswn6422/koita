import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { monitorRuns } from "@/lib/db/schema";
import { mdResponse } from "@/lib/report/download";

export const dynamic = "force-dynamic";

/** 모니터링 회차 보고서 .md 다운로드 */
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const id = Number((await params).runId);
  const [run] = Number.isInteger(id) ? await (await getDb()).select().from(monitorRuns).where(eq(monitorRuns.id, id)) : [];
  if (!run?.reportMd) return new Response("보고서가 없습니다.", { status: 404 });
  const date = new Date(run.startedAt.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  return mdResponse(run.reportMd, `gtt_kr_new_${date}.md`);
}

import { deadlineFrom } from "@/lib/jobs/collect";
import { runMonitor, startOrResumeRun } from "@/lib/jobs/monitor";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 수동 모니터링 실행 (시연용) */
export async function POST() {
  const started = Date.now();
  try {
    const run = await startOrResumeRun("MANUAL");
    const result = await runMonitor(run!, deadlineFrom(maxDuration, started));
    return Response.json({ runId: result.id, state: result.state, ...result.stats });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}

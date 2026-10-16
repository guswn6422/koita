import { deadlineFrom } from "@/lib/jobs/collect";
import { runMonitor, startOrResumeRun } from "@/lib/jobs/monitor";

export const maxDuration = 300; // 플랜별 상한은 배포 전 확인
export const dynamic = "force-dynamic";

/** Vercel Cron 진입점 — 매주 월요일 07:00 KST (vercel.json: 0 22 * * 0 UTC) */
export async function GET(req: Request) {
  const started = Date.now();
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const run = await startOrResumeRun("CRON"); // 진행 중 회차가 있으면 cursor부터 재개
  if (!run) return Response.json({ skipped: "오늘 이미 완료된 회차가 있습니다." });
  const result = await runMonitor(run, deadlineFrom(maxDuration, started));
  return Response.json({ runId: result.id, state: result.state, ...result.stats });
}

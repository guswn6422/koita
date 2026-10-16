import { getDb } from "@/lib/db";
import { analyzePatent } from "@/lib/jobs/analyze";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** 청구항 분해. body: {claimText?: string} (수동 입력 시) */
export async function POST(req: Request, { params }: { params: Promise<{ appNo: string }> }) {
  const { appNo } = await params;
  const body = (await req.json().catch(() => ({}))) as { claimText?: string };
  try {
    const r = await analyzePatent(await getDb(), decodeURIComponent(appNo), { claimText: body.claimText });
    return Response.json({ chartId: r.chart.id, elementCount: r.chart.elementCount, warnings: r.warnings });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 422 });
  }
}

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { claimCharts, patents } from "@/lib/db/schema";
import { claimChartReport } from "@/lib/report/markdown";
import { mdResponse } from "@/lib/report/download";

export const dynamic = "force-dynamic";

/** 최신 청구항 분해표 .md (claim_chart_<출원번호>.md) */
export async function GET(_req: Request, { params }: { params: Promise<{ appNo: string }> }) {
  const appNo = decodeURIComponent((await params).appNo);
  const db = await getDb();
  const [p] = await db.select().from(patents).where(eq(patents.appNo, appNo));
  const [c] = await db.select().from(claimCharts).where(eq(claimCharts.appNo, appNo)).orderBy(desc(claimCharts.id)).limit(1);
  if (!p || !c) return new Response("청구항 분해 결과가 없습니다.", { status: 404 });
  return mdResponse(claimChartReport(p, c), `claim_chart_${appNo}.md`);
}

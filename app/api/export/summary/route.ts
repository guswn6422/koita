import { getDb } from "@/lib/db";
import { patents } from "@/lib/db/schema";
import { summaryReport } from "@/lib/report/markdown";
import { mdResponse } from "@/lib/report/download";

export const dynamic = "force-dynamic";

/** 수집 요약 gtt_kr_summary.md */
export async function GET() {
  const rows = await (await getDb()).select().from(patents);
  return mdResponse(summaryReport(rows), "gtt_kr_summary.md");
}

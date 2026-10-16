import { getDb } from "@/lib/db";
import { exportPatents, parseFilter } from "@/lib/db/queries";
import { toCsv } from "@/lib/report/csv";

export const dynamic = "force-dynamic";

/** 현재 필터 조건 CSV (UTF-8 BOM — 엑셀 한글 깨짐 방지) */
export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const rows = await exportPatents(await getDb(), parseFilter(sp));
  const date = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return new Response("﻿" + toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gtt_kr_patents_${date}.csv"`,
    },
  });
}

import "server-only";
import { eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { patents } from "../db/schema";
import { latestElementCounts } from "../db/queries";
import { computeRisk, type RiskLevel } from "../domain/risk";

type Layer = "L1" | "L2" | "L3" | "L4" | "UNCLASSIFIED";
type Group = "valid" | "pending" | "inactive";

/**
 * 위험도 규칙 적용. 층위가 UNCLASSIFIED면 구조 계열이 아니라고 단정하지 않고 등급을 비워
 * 화면에서 "분류 필요"로 보이게 한다(비유효 상태는 층위와 무관하게 '하').
 */
export function riskFor(p: { statusGroup: Group | null; layer: Layer; elementCount?: number }, highMax: number) {
  const statusGroup = p.statusGroup ?? "pending";
  if (p.layer === "UNCLASSIFIED" && statusGroup !== "inactive") {
    return { risk: null as RiskLevel | null, provisional: true };
  }
  return computeRisk({ statusGroup, layer: p.layer, elementCount: p.elementCount }, highMax);
}

/** 지정한 출원번호들의 위험도를 다시 계산해 저장한다. 바뀐 결과를 돌려준다 */
export async function recomputeRisk(db: Db, appNos: string[], highMax: number) {
  if (appNos.length === 0) return [];
  const rows = await db
    .select({ appNo: patents.appNo, statusGroup: patents.statusGroup, layer: patents.layer, risk: patents.risk, prov: patents.riskProvisional, verified: patents.verified })
    .from(patents)
    .where(inArray(patents.appNo, appNos));
  const counts = await latestElementCounts(db, appNos);
  const out: { appNo: string; risk: RiskLevel | null; provisional: boolean }[] = [];
  for (const r of rows) {
    const next = riskFor({ statusGroup: r.statusGroup, layer: r.layer, elementCount: counts.get(r.appNo) }, highMax);
    // 웹 시드 등 API 미검증 레코드는 KIPRIS 재확인 전까지 잠정으로 둔다
    if (r.verified !== "API") next.provisional = true;
    out.push({ appNo: r.appNo, ...next });
    if (next.risk !== r.risk || next.provisional !== r.prov) {
      await db.update(patents).set({ risk: next.risk, riskProvisional: next.provisional }).where(eq(patents.appNo, r.appNo));
    }
  }
  return out;
}

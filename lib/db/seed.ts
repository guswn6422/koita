import { sql } from "drizzle-orm";
import type { NeonDatabase } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";
import { applicantAliases, classifications, patents, settings } from "./schema";
import { computeRisk } from "../domain/risk";
import { toStatusGroup } from "../domain/status";
import { DEFAULT_SETTINGS } from "../domain/settings-defaults";

/** Skill 2-1 출원인 표기 변형 (구 법인 표기는 비활성으로 두고 필요 시 켠다) */
export const DEFAULT_ALIASES: { name: string; active: boolean; note?: string }[] = [
  { name: "가즈트랑스포르 에 떼끄니가즈", active: true },
  { name: "가즈트랑스포르에떼끄니가즈", active: true },
  { name: "GAZTRANSPORT ET TECHNIGAZ", active: true },
  { name: "GAZTRANSPORT & TECHNIGAZ", active: true },
  { name: "가즈 트랑스포르", active: false, note: "구 법인" },
  { name: "떼끄니가즈", active: false, note: "구 법인" },
  { name: "GAZ TRANSPORT", active: false, note: "구 법인" },
  { name: "TECHNIGAZ", active: false, note: "구 법인" },
];

/**
 * 부록 B — 웹(Google Patents)으로 확인한 5건. 출원번호를 모르므로 `WEB-<등록번호>`를 임시 키로 쓰고,
 * KIPRIS 수집에서 같은 등록번호가 나오면 API 레코드로 대체된다(lib/monitor/sync.ts).
 */
export const WEB_SEEDS = [
  { regNo: "KR102202778B1", title: "코너에서 주름이 연속되는 주름형 밀봉 멤브레인 탱크", family: "MK3", layer: "L2", note: "" },
  { regNo: "KR102525751B1", title: "앵글 브래킷·앵커 로드 코너 구조", family: "MK3", layer: "L2", note: "MK3 추정" },
  { regNo: "KR101645155B1", title: "주름 아래 보강재로 슬로싱 동압 대응", family: "MK3", layer: "L2", note: "" },
  { regNo: "KR102561638B1", title: "1차 단열 패널 틈 대류 방지 충전판", family: "FLEX", layer: "L3", note: "" },
  { regNo: "KR102120988B1", title: "2차 단열 패널 사이 브리징 요소", family: "ETC", layer: "L2", note: "" },
] as const;

type Db = NeonDatabase<typeof schema>;

export async function seedIfEmpty(db: Db) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(applicantAliases);
  if (n > 0) return;

  await db.insert(applicantAliases).values(DEFAULT_ALIASES).onConflictDoNothing();
  await db
    .insert(settings)
    .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })))
    .onConflictDoNothing();

  const statusGroup = toStatusGroup("등록");
  for (const s of WEB_SEEDS) {
    const appNo = `WEB-${s.regNo}`;
    // 시드 상태는 Google Patents 표기 기준 → KIPRIS 재확인 전까지 위험도는 모두 잠정
    const r = computeRisk({ statusGroup, layer: s.layer });
    await db
      .insert(patents)
      .values({
        appNo,
        title: s.title,
        applicant: "GAZTRANSPORT ET TECHNIGAZ",
        regNo: s.regNo,
        status: "등록",
        statusGroup,
        family: s.family,
        layer: s.layer,
        risk: r.risk,
        riskProvisional: true,
        verified: "WEB",
      })
      .onConflictDoNothing();
    await db.insert(classifications).values({
      appNo,
      family: s.family,
      layer: s.layer,
      evidence: { family: [], layer: [] },
      source: "MANUAL",
      note: `부록 B 시드(웹 확인)${s.note ? ` · ${s.note}` : ""}`,
    });
  }
}

import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { claimCharts, patents } from "../db/schema";
import { getSettings } from "../db/queries";
import { claimChart } from "../ai/claim-chart";
import { AiError } from "../ai/llm";
import { getDetail, splitIndependentClaims } from "../kipris/detail";
import type { CallMeter } from "../kipris/client";
import { claimChartReport } from "../report/markdown";
import { findBannedTerms } from "../report/compliance";
import { recomputeRisk } from "./risk";

/** 붙여넣은 청구항 텍스트를 항 단위로 나눈다 ("1. …", "【청구항 1】…") */
export function splitPastedClaims(text: string) {
  const parts = text
    .split(/\n(?=\s*(?:【\s*청구항\s*\d+\s*】|\d+\s*\.))/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : [text.trim()];
}

/**
 * 청구항 분해(analyze)
 * - claimText가 있으면 연구원 입력(MANUAL_INPUT), 없으면 KIPRIS 서지상세의 청구항(API)
 * - 저장 후 위험도를 요소 수로 다시 계산하고, 금지어가 있으면 경고를 돌려준다
 */
export async function analyzePatent(db: Db, appNo: string, opts: { claimText?: string; meter?: CallMeter } = {}) {
  const [p] = await db.select().from(patents).where(eq(patents.appNo, appNo));
  if (!p) throw new AiError(`출원번호 ${appNo}를 찾을 수 없습니다.`);

  let claims: string[];
  let source: "API" | "MANUAL_INPUT";
  if (opts.claimText?.trim()) {
    claims = splitPastedClaims(opts.claimText);
    source = "MANUAL_INPUT";
  } else {
    if (p.verified !== "API" || appNo.startsWith("WEB-")) {
      throw new AiError("KIPRIS로 확인되지 않은 레코드라 청구항을 조회할 수 없습니다. 독립항을 직접 붙여넣어 주세요.");
    }
    const detail = await getDetail(appNo, opts.meter);
    claims = detail?.claims ?? [];
    source = "API";
    if (claims.length === 0) {
      throw new AiError("서지상세 응답에 청구항이 없습니다. 상세 화면에서 독립항을 직접 붙여넣어 주세요.");
    }
  }

  const { independent, all } = splitIndependentClaims(claims);
  const targets = (independent.length ? independent : all.slice(0, 1)).slice(0, 5);
  const chart = await claimChart({ appNo, title: p.title, independentClaims: targets });

  const [saved] = await db
    .insert(claimCharts)
    .values({
      appNo,
      claimNo: chart.claimNo,
      otherIndependent: chart.otherIndependent,
      elements: chart.elements,
      elementCount: chart.elements.length,
      keyLimiting: chart.keyLimiting,
      reviewIdeas: chart.reviewIdeas,
      claimSource: source,
      model: chart.model,
      promptVersion: chart.promptVersion,
    })
    .returning();

  const settings = await getSettings(db);
  await recomputeRisk(db, [appNo], settings.high_max_elements);
  const [updated] = await db.select().from(patents).where(eq(patents.appNo, appNo));
  const md = claimChartReport(updated, saved);
  return { chart: saved, warnings: findBannedTerms(md) };
}

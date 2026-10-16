import type { ClaimChart, Patent } from "../db/schema";
import { RISK_LABEL, type RiskLevel } from "../domain/risk";
import { STATUS_GROUP_LABEL, type StatusGroup } from "../domain/status";
import { FAMILIES, LAYERS, familyLabel, layerLabel } from "../domain/taxonomy";
import { EVENT_LABEL } from "../domain/diff";
import { DISCLAIMER } from "./compliance";

const RISK_ICON: Record<RiskLevel, string> = { HIGH: "🔴", MID: "🟡", LOW: "🟢" };
const esc = (s: string | null | undefined) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
export const fmtAppNo = (n: string) =>
  /^\d{13}$/.test(n) ? `${n.slice(0, 2)}-${n.slice(2, 6)}-${n.slice(6)}` : n;
export function riskText(r: RiskLevel | null, provisional?: boolean) {
  if (!r) return "분류 필요";
  return `${RISK_ICON[r]} ${RISK_LABEL[r]}${provisional ? "(잠정)" : ""}`;
}
const cls = (f: string, l: string) => `${f === "UNCLASSIFIED" ? "미분류" : f} · ${l === "UNCLASSIFIED" ? "미분류" : l}`;
const header = (title: string) => `# ${title}\n\n> ${DISCLAIMER}\n`;
const kstDate = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
const kstDateTime = (d: Date) => new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

/** gtt_kr_summary.md — 총 건수, 상태·계열·층위별 집계, 위험도 상 목록, 최근 3년 추이 */
export function summaryReport(rows: Patent[], now = new Date()) {
  const count = <K extends string>(key: (p: Patent) => K) => {
    const m = new Map<K, number>();
    for (const p of rows) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return m;
  };
  const byGroup = count((p) => (p.statusGroup ?? "pending") as StatusGroup);
  const byFamily = count((p) => p.family);
  const byLayer = count((p) => p.layer);
  const unverified = rows.filter((p) => p.verified !== "API").length;
  const high = rows.filter((p) => p.risk === "HIGH");

  const year = now.getFullYear();
  const years = [year - 3, year - 2, year - 1, year];
  const byYear = years.map((y) => rows.filter((p) => p.appDate?.startsWith(String(y))).length);
  const [y3, y2, y1] = byYear;
  const trend =
    y1 > y2 && y2 >= y3 ? "증가 추세" : y1 < y2 && y2 <= y3 ? "감소 추세" : "등락";
  const trendLine = `최근 3년(${years[0]}~${years[2]}) 출원 ${y3}→${y2}→${y1}건으로 ${trend}이며, ${year}년은 공개 지연(통상 18개월)으로 아직 집계가 적다.`;

  const lines = [
    header(`GTT 한국 특허 수집 요약 — ${kstDate(now)}`),
    `- 총 **${rows.length}건** (검증 출처가 API가 아닌 레코드 ${unverified}건 포함)`,
    "",
    "## 상태별",
    "| 구분 | 건수 |",
    "|---|---|",
    ...(["valid", "pending", "inactive"] as StatusGroup[]).map((g) => `| ${STATUS_GROUP_LABEL[g]} | ${byGroup.get(g) ?? 0} |`),
    "",
    "## 계열별",
    "| 계열 | 건수 |",
    "|---|---|",
    ...[...FAMILIES, "UNCLASSIFIED" as const].map((f) => `| ${f} · ${familyLabel(f)} | ${byFamily.get(f) ?? 0} |`),
    "",
    "## 층위별",
    "| 층위 | 건수 |",
    "|---|---|",
    ...[...LAYERS, "UNCLASSIFIED" as const].map((l) => `| ${l} · ${layerLabel(l)} | ${byLayer.get(l) ?? 0} |`),
    "",
    "## 위험도 상 목록",
    high.length
      ? [
          "| 출원번호 | 발명의 명칭 | 상태 | 계열·층위 | 위험도 | 검증 |",
          "|---|---|---|---|---|---|",
          ...high.map(
            (p) =>
              `| ${fmtAppNo(p.appNo)} | ${esc(p.title)} | ${p.status ?? "-"} | ${cls(p.family, p.layer)} | ${riskText(p.risk, p.riskProvisional)} | ${p.verified} |`,
          ),
        ].join("\n")
      : "해당 없음",
    "",
    "## 최근 3년 출원 추이",
    trendLine,
    "",
  ];
  return lines.join("\n");
}

/** claim_chart_<출원번호>.md — Skill Step 5 템플릿 */
export function claimChartReport(p: Patent, c: ClaimChart) {
  const others = c.otherIndependent?.length ? c.otherIndependent.map((n) => `제${n}항`).join(", ") : "없음";
  return [
    header(`청구항 분해 — ${fmtAppNo(p.appNo)} ${p.title}`),
    `- 법적상태: ${p.status ?? "-"} / 등록번호: ${p.regNo ?? "-"}`,
    `- 계열·층위: ${cls(p.family, p.layer)}`,
    `- 위험도: ${riskText(p.risk, p.riskProvisional)}`,
    `- 독립항: 제${c.claimNo}항 (그 외 독립항: ${others})`,
    `- 청구항 출처: ${c.claimSource === "API" ? "KIPRIS 서지상세" : "연구원 직접 입력"} · 분석 모델: ${c.model ?? "-"} (${c.promptVersion ?? "-"})`,
    "",
    "| 요소 | 청구항 문언(요지) | 기술적 의미 | 회피 검토 포인트 |",
    "|---|---|---|---|",
    ...c.elements.map((e) => `| ${e.label} | ${esc(e.gist)} | ${esc(e.meaning)} | ${esc(e.avoid_points.join(" / "))} |`),
    "",
    `- 핵심 한정 요소(가장 좁히는 요소): ${c.keyLimiting ?? "-"}`,
    `- 검토 아이디어(변리사 검토 전 초안): ${c.reviewIdeas ?? "-"}`,
    "",
  ].join("\n");
}

export type ReportEvent = {
  type: keyof typeof EVENT_LABEL;
  appNo: string;
  before: string | null;
  after: string | null;
  patent: Pick<Patent, "title" | "status" | "family" | "layer" | "risk" | "riskProvisional"> | null;
  memo?: string;
};

/** gtt_kr_new_<YYYY-MM-DD>.md — 모니터링 회차 보고서 */
export function monitorReport(opts: {
  startedAt: Date;
  previousCheck: Date | null;
  aliases: string[];
  events: ReportEvent[];
  state: string;
  apiCalls: number;
  error?: string | null;
}) {
  const added = opts.events.filter((e) => e.type === "NEW").length;
  const changed = opts.events.length - added;
  const high = opts.events.filter((e) => e.patent?.risk === "HIGH").length;
  const lines = [
    header(`GTT 한국 특허 모니터링 — ${kstDate(opts.startedAt)}`),
    `- 점검 범위: KIPRIS / 출원인 GTT 계열 (${opts.aliases.join(", ")}) / 직전 점검: ${
      opts.previousCheck ? kstDate(opts.previousCheck) : "없음(첫 점검)"
    }`,
    `- 실제 실행 시각: ${kstDateTime(opts.startedAt)} KST · 상태: ${opts.state} · KIPRIS 호출 ${opts.apiCalls}회`,
    `- 신규 ${added}건 · 상태변경 ${changed}건 · 위험도 상 ${high}건`,
    "",
  ];
  if (opts.error) lines.push(`> ⚠️ 오류(원문): ${opts.error}`, "");
  if (opts.events.length === 0) {
    lines.push("신규·변경 없음");
  } else {
    lines.push(
      "| 구분 | 출원번호 | 발명의 명칭 | 상태 | 계열·층위 | 위험도 | 한 줄 메모 |",
      "|---|---|---|---|---|---|---|",
      ...opts.events.map((e) => {
        const memo =
          e.memo ?? (e.type === "NEW" ? "" : `${e.before ?? "(없음)"} → ${e.after ?? "(없음)"}`);
        return `| ${EVENT_LABEL[e.type]} | ${fmtAppNo(e.appNo)} | ${esc(e.patent?.title)} | ${e.patent?.status ?? "-"} | ${
          e.patent ? cls(e.patent.family, e.patent.layer) : "-"
        } | ${e.patent ? riskText(e.patent.risk, e.patent.riskProvisional) : "-"} | ${esc(memo)} |`;
      }),
    );
  }
  lines.push("");
  return lines.join("\n");
}

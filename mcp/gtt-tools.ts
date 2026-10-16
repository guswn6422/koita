/**
 * MCP 도구 로직 — 앱의 lib/ 모듈(KIPRIS 클라이언트·도메인 규칙·보고서)을 그대로 재사용한다.
 * 원칙: 사실은 API(KIPRIS), 규칙은 코드(위험도·금지어), 판단(분류·청구항 분해)은 대화 중인 Claude.
 * 앱의 로컬 DB(PGlite)는 열지 않는다 — 개발 서버와 동시에 열면 충돌하기 때문.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { kiprisCall, type CallMeter } from "../lib/kipris/client";
import { getDetail, splitIndependentClaims } from "../lib/kipris/detail";
import { searchApplicantPage, parseSearchDoc } from "../lib/kipris/search";
import { dedupe, type NormalizedPatent } from "../lib/kipris/normalize";
import { computeRisk, RISK_LABEL, type RiskLevel } from "../lib/domain/risk";
import { STATUS_GROUP_LABEL, toStatusGroup, type StatusGroup } from "../lib/domain/status";
import { FAMILIES, FAMILY_INFO, LAYERS, LAYER_INFO } from "../lib/domain/taxonomy";
import { claimChartReport, fmtAppNo, riskText } from "../lib/report/markdown";
import { DISCLAIMER, findBannedTerms } from "../lib/report/compliance";
import { AVOID_POINTS } from "../lib/ai/avoid-points";
import type { ClaimChart, Patent } from "../lib/db/schema";

export const GTT_ALIAS = "가즈트랑스포르 에 떼끄니가즈";
const quiet = () => {}; // 상태 매핑 경고는 MCP 응답에 섞지 않는다

type Compact = {
  appNo: string; appDate: string | null; title: string; applicant: string | null; status: string | null;
  statusGroup: StatusGroup; regNo: string | null; ipc: string[]; abstract?: string | null;
};

function compact(p: NormalizedPatent, withAbstract: boolean): Compact {
  return {
    appNo: p.appNo, appDate: p.appDate, title: p.title, applicant: p.applicant, status: p.status,
    statusGroup: toStatusGroup(p.status, quiet), regNo: p.regNo, ipc: p.ipc,
    ...(withAbstract ? { abstract: p.abstract } : {}),
  };
}

// ── 1. 일반 검색 ──────────────────────────────────────────
export async function kiprisSearch(q: {
  keyword?: string; title?: string; applicant?: string; ipc?: string;
  dateFrom?: string; dateTo?: string; page?: number; rows?: number; includeAbstract?: boolean;
}) {
  const rows = Math.min(Math.max(q.rows ?? 20, 1), 100);
  const page = Math.max(q.page ?? 1, 1);
  const base = { patent: "true", utility: "true", numOfRows: rows, pageNo: page };
  const advanced = q.title || q.applicant || q.ipc || q.dateFrom || q.dateTo;
  const meter: CallMeter = { calls: 0 };
  let doc;
  if (!advanced) {
    if (!q.keyword) throw new Error("keyword, title, applicant, ipc, 기간 중 하나 이상을 지정하세요.");
    ({ doc } = await kiprisCall("getWordSearch", { ...base, word: q.keyword, year: 0 }, meter));
  } else {
    const params: Record<string, string | number> = { ...base };
    if (q.keyword) params.word = q.keyword;
    if (q.title) params.inventionTitle = q.title;
    if (q.applicant) params.applicant = q.applicant;
    if (q.ipc) params.ipcNumber = q.ipc;
    if (q.dateFrom || q.dateTo) {
      const d = (v?: string) => (v ?? "").replace(/\D/g, "");
      params.applicationDate = `${d(q.dateFrom)}~${d(q.dateTo)}`;
    }
    ({ doc } = await kiprisCall("getAdvancedSearch", params, meter));
  }
  const r = parseSearchDoc(doc);
  return {
    total: r.total, page, rows, returned: r.records.length, kiprisCalls: meter.calls,
    results: r.records.map((p) => compact(p, q.includeAbstract ?? true)),
    note: "verified: API (KIPRIS 응답). 번호·상태는 이 응답만 근거로 쓴다.",
  };
}

// ── 2. GTT 포트폴리오 (전체 수집 + 필터, 30분 캐시) ─────────────────
let cache: { at: number; records: NormalizedPatent[]; total: number; calls: number } | null = null;
const CACHE_MS = 30 * 60_000;

async function loadPortfolio(refresh: boolean) {
  if (!refresh && cache && Date.now() - cache.at < CACHE_MS) return cache;
  const meter: CallMeter = { calls: 0 };
  const all: NormalizedPatent[] = [];
  let total = 0;
  for (let page = 1; page <= 20; page++) {
    const r = await searchApplicantPage(GTT_ALIAS, page, 100, meter);
    total = r.total;
    all.push(...r.records);
    if (r.itemCount === 0 || page * 100 >= r.total) break;
  }
  cache = { at: Date.now(), records: dedupe(all), total, calls: meter.calls };
  return cache;
}

export async function gttPortfolio(f: {
  query?: string; statusGroup?: StatusGroup; yearFrom?: number; yearTo?: number; ipcPrefix?: string;
  limit?: number; includeAbstract?: boolean; refresh?: boolean;
}) {
  const c = await loadPortfolio(!!f.refresh);
  const words = (f.query ?? "").split(/[\s,]+/).map((w) => w.trim()).filter(Boolean);
  const year = (p: NormalizedPatent) => (p.appDate ? Number(p.appDate.slice(0, 4)) : null);
  const matched = c.records.filter((p) => {
    if (f.statusGroup && toStatusGroup(p.status, quiet) !== f.statusGroup) return false;
    const y = year(p);
    if (f.yearFrom && (!y || y < f.yearFrom)) return false;
    if (f.yearTo && (!y || y > f.yearTo)) return false;
    if (f.ipcPrefix && !p.ipc.some((i) => i.replace(/\s/g, "").startsWith(f.ipcPrefix!.replace(/\s/g, "")))) return false;
    if (words.length) {
      const hay = `${p.title} ${p.abstract ?? ""}`.toLowerCase();
      if (!words.some((w) => hay.includes(w.toLowerCase()))) return false; // 단어 중 하나라도 포함(OR)
    }
    return true;
  });
  matched.sort((a, b) => (b.appDate ?? "").localeCompare(a.appDate ?? ""));

  const byGroup: Record<string, number> = { valid: 0, pending: 0, inactive: 0 };
  const byYear: Record<string, number> = {};
  for (const p of matched) {
    byGroup[toStatusGroup(p.status, quiet)]++;
    const y = year(p);
    if (y) byYear[y] = (byYear[y] ?? 0) + 1;
  }
  const limit = Math.min(Math.max(f.limit ?? 30, 1), 200);
  return {
    source: `KIPRIS getAdvancedSearch · 출원인 "${GTT_ALIAS}" (표기 4종이 같은 결과를 반환함을 2026-10-16 확인)`,
    portfolioTotal: c.records.length,
    fetchedAt: new Date(c.at).toISOString(),
    kiprisCalls: f.refresh || c.at > Date.now() - 2000 ? c.calls : 0,
    matched: matched.length,
    byStatusGroup: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [`${k} (${STATUS_GROUP_LABEL[k as StatusGroup]})`, v])),
    byApplicationYear: byYear,
    returned: Math.min(limit, matched.length),
    results: matched.slice(0, limit).map((p) => compact(p, f.includeAbstract ?? false)),
  };
}

// ── 3. 서지상세 + 청구항 ─────────────────────────────────────
export async function patentDetail(appNo: string, opts: { dependentChars?: number } = {}) {
  const no = appNo.replace(/\D/g, "");
  const d = await getDetail(no);
  if (!d) throw new Error(`KIPRIS에서 ${appNo} 서지 정보를 해석하지 못했습니다.`);
  const { all, independent } = splitIndependentClaims(d.claims);
  const indepNos = new Set(independent.map((c) => c.no));
  const cut = opts.dependentChars ?? 200;
  return {
    appNo: d.appNo, appNoFormatted: fmtAppNo(d.appNo), title: d.title, applicant: d.applicant,
    appDate: d.appDate, pubNo: d.pubNo, pubDate: d.pubDate, regNo: d.regNo, regDate: d.regDate,
    status: d.status, statusGroup: toStatusGroup(d.status, quiet), ipc: d.ipc, abstract: d.abstract,
    claimCount: all.length,
    independentClaims: independent.map((c) => ({ no: c.no, text: c.text })),
    dependentClaims: all.filter((c) => !indepNos.has(c.no)).map((c) => ({ no: c.no, text: c.text.length > cut ? `${c.text.slice(0, cut)}…` : c.text })),
    note: d.claims.length ? "청구항 출처: KIPRIS 서지상세(API)" : "응답에 청구항이 없습니다. 사용자에게 독립항 원문을 요청하세요.",
  };
}

// ── 4. 분석 가이드 (Skill 3장·Step 5·6·품질 규칙) ─────────────────
export function analysisGuide() {
  const fam = FAMILIES.map((f) => `| ${f} | ${FAMILY_INFO[f].label} | ${FAMILY_INFO[f].cues} |`).join("\n");
  const lay = LAYERS.map((l) => `| ${l} | ${LAYER_INFO[l].label} | ${LAYER_INFO[l].examples} |`).join("\n");
  return `# GTT 특허 분석 가이드

## 분류 — 모든 특허에 계열 1개 + 층위 1개. 근거 단어를 1개 이상 남기고, 근거가 약하면 UNCLASSIFIED.
| 코드 | 계열 | 판별 단서 |
|---|---|---|
${fam}

| 코드 | 층위 | 예시 |
|---|---|---|
${lay}

## 청구항 분해 — 가장 넓은 독립항(보통 제1항)을 구성요소 A, B, C…로 나눈다
- 요소마다: 청구항 문언 요지(한 문장), 기술적 의미, 회피 검토 포인트(${AVOID_POINTS.join(" / ")})
- 핵심 한정 요소(가장 좁히는 요소)와 "검토 아이디어(변리사 검토 전 초안)"를 적는다
- 결과는 save_claim_chart_report 도구로 저장한다 (위험도는 도구가 규칙으로 계산)

## 위험도 (compute_risk 도구가 계산 — 직접 매기지 않는다)
- 상: 등록 + L1·L2 + 독립항 구성요소 ≤ 4개(넓은 권리). 분해 전이면 '상(잠정)'
- 중: 등록 + L3·L4, 또는 공개(심사중) + L1·L2, 또는 등록 + L1·L2 + 요소 5개 이상
- 하: 비유효(소멸·거절·취하·포기), 또는 공개 + L3·L4

## 품질 규칙
- 번호·상태·청구항은 KIPRIS 도구 응답에 있는 것만 쓴다. 지어내지 않는다.
- "침해한다 / 침해하지 않는다 / 무효" 같은 법적 결론을 쓰지 않는다. "검토 필요", "검토 아이디어"로 표현한다.
- 청구항 원문 전문을 옮기지 않고 요소별 요지만 적는다.
- 공개 특허 정보만 다룬다. 자사 설계 자료는 회사 승인 환경에서만 다룬다.
- 모든 보고서 머리말: "${DISCLAIMER}"`;
}

// ── 5. 위험도 규칙 ─────────────────────────────────────────
export function riskTool(p: { status?: string; statusGroup?: StatusGroup; layer: "L1" | "L2" | "L3" | "L4" | "UNCLASSIFIED"; elementCount?: number; highMaxElements?: number }) {
  const group = p.statusGroup ?? toStatusGroup(p.status, quiet);
  if (p.layer === "UNCLASSIFIED" && group !== "inactive") {
    return { risk: null, label: "분류 필요", provisional: true, statusGroup: group, rule: "층위가 미분류라 위험도를 계산하지 않음" };
  }
  const r = computeRisk({ statusGroup: group, layer: p.layer, elementCount: p.elementCount }, p.highMaxElements ?? 4);
  return { ...r, label: riskText(r.risk, r.provisional), statusGroup: group, rule: "Skill Step 6 규칙 함수 (lib/domain/risk.ts)" };
}

// ── 6·7. 보고서 저장 ───────────────────────────────────────
let reportsDir = path.resolve(process.cwd(), "reports");
/** 보고서 저장 폴더 (server.mts가 프로젝트 기준으로 지정) */
export function setReportsDir(dir: string) {
  reportsDir = dir;
}
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function save(filename: string, md: string) {
  mkdirSync(reportsDir, { recursive: true });
  const file = path.join(reportsDir, filename.replace(/[\\/:*?"<>|]/g, "_"));
  writeFileSync(file, md, "utf-8");
  return file;
}

export type ElementInput = { label: string; gist: string; meaning: string; avoid_points: string[] };

export async function saveClaimChart(p: {
  appNo: string; family: (typeof FAMILIES)[number] | "UNCLASSIFIED"; layer: (typeof LAYERS)[number] | "UNCLASSIFIED";
  claimNo: number; otherIndependent?: number[]; elements: ElementInput[]; keyLimiting: string; reviewIdeas: string;
  claimSource?: "API" | "MANUAL_INPUT"; acknowledgeWarnings?: boolean;
}) {
  const d = await getDetail(p.appNo.replace(/\D/g, ""));
  if (!d) throw new Error(`KIPRIS에서 ${p.appNo}를 찾지 못했습니다.`);
  const group = toStatusGroup(d.status, quiet);
  const risk = riskTool({ statusGroup: group, layer: p.layer, elementCount: p.elements.length });
  const patent = {
    appNo: d.appNo, title: d.title, status: d.status, regNo: d.regNo, family: p.family, layer: p.layer,
    risk: risk.risk as RiskLevel | null, riskProvisional: risk.provisional,
  } as Patent;
  const chart = {
    claimNo: p.claimNo, otherIndependent: p.otherIndependent ?? [], elements: p.elements, elementCount: p.elements.length,
    keyLimiting: p.keyLimiting, reviewIdeas: p.reviewIdeas, claimSource: p.claimSource ?? "API",
    model: "Claude (대화형 분석)", promptVersion: "mcp-claim-chart-v1",
  } as ClaimChart;
  const md = claimChartReport(patent, chart);
  const banned = findBannedTerms(md);
  if (banned.length && !p.acknowledgeWarnings) {
    return { saved: false, warnings: banned, message: `금지 표현(${banned.join(", ")})이 있어 저장하지 않았습니다. 표현을 고친 뒤 다시 호출하세요.`, markdown: md };
  }
  const file = save(`claim_chart_${d.appNo}.md`, md);
  return { saved: true, file, risk: risk.label, elementCount: p.elements.length, warnings: banned, markdown: md };
}

export async function savePatentReport(p: {
  title: string; filename?: string; body: string;
  patents?: { appNo: string; family?: string; layer?: "L1" | "L2" | "L3" | "L4" | "UNCLASSIFIED"; elementCount?: number; memo?: string }[];
  acknowledgeWarnings?: boolean;
}) {
  // 표에 들어가는 번호·명칭·상태는 KIPRIS에서 다시 조회해 채운다(지어낸 값이 섞이지 않게)
  const rows: string[] = [];
  const unresolved: string[] = [];
  for (const it of p.patents ?? []) {
    const no = it.appNo.replace(/\D/g, "");
    const d = await getDetail(no).catch(() => null);
    if (!d) { unresolved.push(it.appNo); continue; }
    const layer = it.layer ?? "UNCLASSIFIED";
    const r = riskTool({ status: d.status ?? undefined, layer, elementCount: it.elementCount });
    const esc = (s?: string | null) => (s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
    rows.push(`| ${fmtAppNo(d.appNo)} | ${esc(d.title)} | ${d.status ?? "-"} | ${d.regNo ?? "-"} | ${it.family ?? "미분류"} · ${layer === "UNCLASSIFIED" ? "미분류" : layer} | ${r.label} | ${esc(it.memo)} |`);
  }
  const table = rows.length
    ? ["## 대상 특허 (KIPRIS 확인)", "", "| 출원번호 | 발명의 명칭 | 상태 | 등록번호 | 계열·층위 | 위험도 | 메모 |", "|---|---|---|---|---|---|---|", ...rows, ""].join("\n")
    : "";
  const md = [
    `# ${p.title}`, "", `> ${DISCLAIMER}`, "",
    `- 작성일: ${kstToday()} · 데이터: KIPRIS Plus (verified: API)`, "",
    p.body.trim(), "",
    table,
    unresolved.length ? `> ⚠️ KIPRIS에서 확인하지 못한 번호(미검증): ${unresolved.join(", ")}\n` : "",
  ].join("\n");
  const banned = findBannedTerms(md);
  if (banned.length && !p.acknowledgeWarnings) {
    return { saved: false, warnings: banned, message: `금지 표현(${banned.join(", ")})이 있어 저장하지 않았습니다.`, markdown: md };
  }
  const name = p.filename?.trim() || `gtt_report_${kstToday()}`;
  const file = save(name.endsWith(".md") ? name : `${name}.md`, md);
  return { saved: true, file, verified: rows.length, unresolved, warnings: banned, markdown: md };
}

export { RISK_LABEL };

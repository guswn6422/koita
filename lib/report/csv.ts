import type { Patent } from "../db/schema";
import { RISK_LABEL } from "../domain/risk";

const COLUMNS: [string, (p: Patent) => unknown][] = [
  ["app_no", (p) => p.appNo],
  ["app_date", (p) => p.appDate],
  ["title", (p) => p.title],
  ["applicant", (p) => p.applicant],
  ["ipc", (p) => (p.ipc ?? []).join("|")],
  ["pub_no", (p) => p.pubNo],
  ["pub_date", (p) => p.pubDate],
  ["reg_no", (p) => p.regNo],
  ["reg_date", (p) => p.regDate],
  ["status", (p) => p.status],
  ["status_group", (p) => p.statusGroup],
  ["family", (p) => p.family],
  ["layer", (p) => p.layer],
  ["risk", (p) => (p.risk ? RISK_LABEL[p.risk] + (p.riskProvisional ? "(잠정)" : "") : "")],
  ["verified", (p) => p.verified],
  ["first_seen", (p) => p.firstSeen?.toISOString()],
  ["last_checked", (p) => p.lastChecked?.toISOString()],
];

function cell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Skill Step 7 스키마 순서의 CSV (BOM은 호출 측에서 붙인다) */
export function toCsv(rows: Patent[]) {
  const lines = [COLUMNS.map(([h]) => h).join(",")];
  for (const p of rows) lines.push(COLUMNS.map(([, get]) => cell(get(p))).join(","));
  return lines.join("\r\n") + "\r\n";
}

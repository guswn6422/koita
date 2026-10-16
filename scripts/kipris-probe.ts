// KIPRIS 연결 점검: 출원인 1페이지 검색 + 첫 건 상세 조회 결과 요약 (키는 출력하지 않음)
// 사용법: npx tsx scripts/kipris-probe.ts "<출원인명>" [save]
import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync } from "node:fs";
import { kiprisCall, maskKey } from "../lib/kipris/client";
import { parseSearchDoc } from "../lib/kipris/search";
import { parseDetailDoc } from "../lib/kipris/detail";

async function main() {
  const name = process.argv[2] ?? "가즈트랑스포르 에 떼끄니가즈";
  const save = process.argv[3] === "save";
  const s = await kiprisCall("getAdvancedSearch", { applicant: name, patent: "true", utility: "true", numOfRows: 5, pageNo: 1 });
  const r = parseSearchDoc(s.doc);
  console.log(`[${name}] total=${r.total} items=${r.itemCount}`);
  for (const p of r.records) console.log(" ", p.appNo, p.status, p.regNo, p.applicant, "|", p.title.slice(0, 40));
  if (save) writeFileSync("tests/fixtures/kipris/search_live.xml", s.xml);
  const first = r.records.find((x) => x.regNo) ?? r.records[0];
  if (!first) return;
  const d = await kiprisCall("getBibliographyDetailInfoSearch", { applicationNumber: first.appNo });
  const det = parseDetailDoc(d.doc);
  console.log("detail:", det?.appNo, det?.applicant, det?.ipc, "claims:", det?.claims.length);
  console.log("first claim:", det?.claims[0]?.slice(0, 200));
  if (save) writeFileSync("tests/fixtures/kipris/detail_live.xml", d.xml);
}

main().catch((e) => {
  console.error(maskKey(String(e)));
  process.exit(1);
});

// MCP 서버 스모크 테스트: stdio로 서버를 띄워 도구 목록과 주요 도구를 호출한다
// 사용법: node node_modules/tsx/dist/cli.mjs scripts/mcp-smoke.mts
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(ROOT, "node_modules/tsx/dist/cli.mjs"), path.join(ROOT, "mcp/server.mts")],
  cwd: process.env.SMOKE_CWD ?? "C:\\", // Claude 데스크톱처럼 프로젝트 밖에서 실행돼도 동작하는지 확인
  stderr: "inherit",
});
const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("tools:", tools.map((t) => t.name).join(", "));
const { prompts } = await client.listPrompts();
console.log("prompts:", prompts.map((p) => p.name).join(", "));

const text = (r: any) => r.content?.[0]?.text ?? "";
const call = async (name: string, args: Record<string, unknown>) => {
  const r: any = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, body: text(r) };
};

let r = await call("gtt_portfolio", { query: "코너 앵커", statusGroup: "valid", limit: 3 });
const pf = JSON.parse(r.body);
console.log("gtt_portfolio:", r.isError, "total", pf.portfolioTotal, "matched", pf.matched, pf.byStatusGroup, pf.results.map((x: any) => `${x.appNo} ${x.title}`));

r = await call("kipris_search", { keyword: "멤브레인 단열 코너", rows: 3, includeAbstract: false });
const ks = JSON.parse(r.body);
console.log("kipris_search:", r.isError, "total", ks.total, ks.results.map((x: any) => `${x.appNo} ${x.applicant} | ${x.title}`));

r = await call("kipris_patent_detail", { appNo: "10-2018-0077195" });
const d = JSON.parse(r.body);
console.log("detail:", r.isError, d.title, d.status, "claims", d.claimCount, "independent", d.independentClaims.map((c: any) => c.no));

r = await call("compute_risk", { status: "등록", layer: "L2", elementCount: 3 });
console.log("compute_risk:", r.body.replace(/\s+/g, " "));

r = await call("gtt_analysis_guide", {});
console.log("guide chars:", r.body.length);

r = await call("save_claim_chart_report", {
  appNo: "1020180077195", family: "MK3", layer: "L2", claimNo: 1, keyLimiting: "B",
  elements: [
    { label: "A", gist: "엣지 코너를 이루는 두 베어링 벽", meaning: "적용 대상", avoid_points: ["배치 변경"] },
    { label: "B", gist: "탭에 결합된 앵커 로드로 앵글 브라켓 고정", meaning: "하중 전달 경로", avoid_points: ["치환"] },
  ],
  reviewIdeas: "이 구성은 침해하지 않는다", // 금지어 → 저장 거부 확인
});
console.log("save (banned):", JSON.parse(r.body).saved, JSON.parse(r.body).warnings);

r = await call("save_patent_report", {
  title: "스모크 테스트 보고서", filename: "_smoke_test",
  body: "## 요약\n- 테스트 본문", patents: [{ appNo: "1020180077195", family: "MK3", layer: "L2", memo: "코너 앵커" }, { appNo: "1020999999999" }],
});
const sp = JSON.parse(r.body);
console.log("save_patent_report:", r.isError, sp.saved, sp.file, "verified", sp.verified, "unresolved", sp.unresolved);

r = await call("kipris_patent_detail", { appNo: "123" });
console.log("bad appNo:", r.isError, r.body.slice(0, 120));

await client.close();

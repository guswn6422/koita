/**
 * GTT 특허 MCP 서버 (stdio)
 * Claude 데스크톱 앱 채팅에서 KIPRIS 검색·서지상세·위험도 규칙·보고서 저장을 도구로 쓴다.
 * 실행: node node_modules/tsx/dist/cli.mjs mcp/server.mts   (stdout은 MCP 프로토콜 전용 — 로그는 stderr)
 */
import path from "node:path";
import { config } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ROOT = path.resolve(import.meta.dirname, "..");
config({ path: path.join(ROOT, ".env.local"), quiet: true });

const tools = await import("./gtt-tools");
tools.setReportsDir(path.join(ROOT, "reports"));
const { AVOID_POINTS } = await import("../lib/ai/avoid-points");
const { maskKey } = await import("../lib/kipris/client");

const server = new McpServer({ name: "gtt-patent", version: "1.0.0" });

/** 결과를 JSON 텍스트로, 오류는 isError로 (ServiceKey는 가림) */
async function run<T>(fn: () => Promise<T> | T) {
  try {
    const data = await fn();
    const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
    return { content: [{ type: "text" as const, text }] };
  } catch (e) {
    const msg = maskKey(e instanceof Error ? e.message : String(e));
    return { content: [{ type: "text" as const, text: `오류: ${msg}` }], isError: true };
  }
}

const statusGroup = z.enum(["valid", "pending", "inactive"]);
const layer = z.enum(["L1", "L2", "L3", "L4", "UNCLASSIFIED"]);
const family = z.enum(["NO96", "MK3", "FLEX", "SLIM", "GST", "ETC", "UNCLASSIFIED"]);

server.registerTool(
  "kipris_search",
  {
    title: "KIPRIS 특허 검색",
    description:
      "KIPRIS Plus로 한국 특허·실용신안을 검색한다. keyword만 주면 자유어 검색, title·applicant·ipc·기간을 주면 항목 검색. " +
      "출원번호·상태·등록번호는 이 응답만 사실로 쓴다. GTT 전체 포트폴리오는 gtt_portfolio가 더 빠르다.",
    inputSchema: {
      keyword: z.string().optional().describe("자유어 (예: 멤브레인 코너 앵커)"),
      title: z.string().optional().describe("발명의 명칭에 포함될 말"),
      applicant: z.string().optional().describe("출원인 (예: 가즈트랑스포르 에 떼끄니가즈, 삼성중공업)"),
      ipc: z.string().optional().describe("IPC (예: F17C 3/02)"),
      dateFrom: z.string().optional().describe("출원일 시작 YYYYMMDD"),
      dateTo: z.string().optional().describe("출원일 끝 YYYYMMDD"),
      page: z.number().int().min(1).optional(),
      rows: z.number().int().min(1).max(100).optional().describe("페이지당 건수 (기본 20)"),
      includeAbstract: z.boolean().optional().describe("요약 포함 (기본 true)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  (args) => run(() => tools.kiprisSearch(args)),
);

server.registerTool(
  "gtt_portfolio",
  {
    title: "GTT 한국 특허 포트폴리오",
    description:
      "GTT(가즈트랑스포르 에 떼끄니가즈)의 한국 특허 전체(약 550건)를 KIPRIS에서 받아 필터·집계한다(30분 캐시). " +
      "query는 명칭·요약에 대한 OR 단어 검색. 상태군·출원연도·IPC로 좁히고 연도별·상태별 건수를 함께 돌려준다.",
    inputSchema: {
      query: z.string().optional().describe("명칭·요약 검색어, 공백으로 여러 개(OR). 예: '코너 앵커'"),
      statusGroup: statusGroup.optional().describe("valid=등록, pending=공개·심사중, inactive=소멸·거절 등"),
      yearFrom: z.number().int().optional(),
      yearTo: z.number().int().optional(),
      ipcPrefix: z.string().optional().describe("예: F17C3, B63B25/16"),
      limit: z.number().int().min(1).max(200).optional().describe("목록 최대 건수 (기본 30)"),
      includeAbstract: z.boolean().optional().describe("요약 포함 (기본 false — 길어짐)"),
      refresh: z.boolean().optional().describe("캐시를 무시하고 KIPRIS에서 다시 수집"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  (args) => run(() => tools.gttPortfolio(args)),
);

server.registerTool(
  "kipris_patent_detail",
  {
    title: "특허 서지상세·청구항",
    description: "출원번호로 KIPRIS 서지상세를 조회한다. 독립항은 전문, 종속항은 앞부분만 돌려준다. 청구항 분해 전에 호출한다.",
    inputSchema: {
      appNo: z.string().describe("출원번호 (10-2018-0077195 또는 1020180077195)"),
      dependentChars: z.number().int().min(0).max(2000).optional().describe("종속항 표시 글자 수 (기본 200)"),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  ({ appNo, dependentChars }) => run(() => tools.patentDetail(appNo, { dependentChars })),
);

server.registerTool(
  "gtt_analysis_guide",
  {
    title: "분석 기준 (분류·청구항 분해·위험도·품질 규칙)",
    description: "계열 6종·층위 4종 판별 단서, 청구항 분해 템플릿, 위험도 규칙, 법적 표현 금지 규칙. 분류·분해·보고서 작성 전에 한 번 읽는다.",
    annotations: { readOnlyHint: true },
  },
  () => run(() => tools.analysisGuide()),
);

server.registerTool(
  "compute_risk",
  {
    title: "위험도 규칙 계산",
    description: "법적상태·층위·독립항 구성요소 수로 위험도(상/중/하)를 결정적 규칙으로 계산한다. 위험도는 직접 판단하지 말고 이 도구를 쓴다.",
    inputSchema: {
      status: z.string().optional().describe("KIPRIS 법적상태 원문 (등록, 공개, 소멸 …)"),
      statusGroup: statusGroup.optional(),
      layer,
      elementCount: z.number().int().min(1).optional().describe("독립항 구성요소 수 — 분해 전이면 생략(잠정)"),
      highMaxElements: z.number().int().min(1).optional().describe("상 판정 최대 요소 수 (기본 4)"),
    },
    annotations: { readOnlyHint: true },
  },
  (args) => run(() => tools.riskTool(args)),
);

const element = z.object({
  label: z.string().describe("A, B, C …"),
  gist: z.string().describe("청구항 문언 요지 (한 문장, 원문 전문 금지)"),
  meaning: z.string().describe("기술적 의미"),
  avoid_points: z.array(z.enum(AVOID_POINTS)).describe("회피 검토 포인트"),
});

server.registerTool(
  "save_claim_chart_report",
  {
    title: "청구항 분해표 저장 (.md)",
    description:
      "독립항 분해 결과를 Skill Step 5 템플릿의 claim_chart_<출원번호>.md로 저장한다. 상태·등록번호는 KIPRIS에서 다시 조회하고 " +
      "위험도는 요소 수로 규칙 계산한다. 금지 표현(침해한다/침해하지 않는다/무효)이 있으면 저장하지 않고 경고한다.",
    inputSchema: {
      appNo: z.string(),
      family,
      layer,
      claimNo: z.number().int().describe("분해한 독립항 번호"),
      otherIndependent: z.array(z.number().int()).optional(),
      elements: z.array(element).min(1),
      keyLimiting: z.string().describe("핵심 한정 요소 label"),
      reviewIdeas: z.string().describe("검토 아이디어 (변리사 검토 전 초안)"),
      claimSource: z.enum(["API", "MANUAL_INPUT"]).optional(),
      acknowledgeWarnings: z.boolean().optional().describe("금지 표현 경고를 확인하고도 저장할 때만 true"),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  (args) => run(() => tools.saveClaimChart(args)),
);

server.registerTool(
  "save_patent_report",
  {
    title: "특허 검토 보고서 저장 (.md)",
    description:
      "Claude가 쓴 본문(markdown)에 법적 고지 머리말과 대상 특허 표를 붙여 reports/ 폴더에 저장한다. " +
      "표의 명칭·상태·등록번호는 KIPRIS에서 다시 조회해 채우고, 위험도는 규칙으로 계산한다. 확인되지 않은 번호는 '미검증'으로 표시한다.",
    inputSchema: {
      title: z.string().describe("보고서 제목"),
      filename: z.string().optional().describe("파일명 (기본 gtt_report_<날짜>.md)"),
      body: z.string().describe("본문 markdown — 동향 해석, 요약, 검토 포인트 등 (머리말·대상 표는 도구가 붙임)"),
      patents: z
        .array(
          z.object({
            appNo: z.string(),
            family: z.string().optional(),
            layer: layer.optional(),
            elementCount: z.number().int().optional(),
            memo: z.string().optional().describe("한 줄 메모"),
          }),
        )
        .optional(),
      acknowledgeWarnings: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  (args) => run(() => tools.savePatentReport(args)),
);

server.registerPrompt(
  "gtt_patent_report",
  {
    title: "GTT 특허 검토 보고서 작성",
    description: "주제를 받아 검색 → 상세·청구항 → 분류·위험도 → 보고서 저장까지 진행한다",
    argsSchema: { topic: z.string().describe("검토 주제 (예: 코너부 앵커링 구조)") },
  },
  ({ topic }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `GTT 한국 특허 중 "${topic}" 관련 건을 검토해 보고서를 작성해줘.\n` +
            "1) gtt_analysis_guide로 기준 확인 → 2) gtt_portfolio로 관련 특허 찾기(필요하면 kipris_search) → " +
            "3) 핵심 등록 특허 2~3건은 kipris_patent_detail로 독립항 확인 후 분해하고 save_claim_chart_report로 저장 → " +
            "4) 각 건 계열·층위를 근거 단어와 함께 붙이고 위험도는 compute_risk로 계산 → " +
            "5) 동향·검토 포인트를 정리해 save_patent_report로 저장. 법적 결론은 쓰지 말 것.",
        },
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
console.error("[gtt-patent MCP] ready (stdio)");

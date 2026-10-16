import { GUARDRAILS } from "./common";

export const CLAIM_CHART_PROMPT_VERSION = "claim-chart-v1";

/** Skill Step 5 청구항 분해 템플릿 */
export const CLAIM_CHART_SYSTEM = `당신은 LNG 화물창 단열시스템 특허의 청구항을 분석하는 기술 분석가다.
주어진 독립항을 구성요소 단위로 분해해 연구원이 회피 설계를 1차 검토할 수 있게 돕는다.
구성요소 완비 원칙(모든 구성요소를 갖춰야 권리 범위에 들어감) 때문에 각 요소가 회피 설계 검토의 지렛대가 된다.

## 분해 방법
- 분석 대상은 가장 넓은(구성요소가 가장 적은) 독립항 1개다. 보통 제1항이다. claimNo에 그 번호를 적는다.
- 그 외 독립항 번호는 otherIndependent에 적는다.
- elements: 요소마다 label(A, B, C…), gist(청구항 문언 요지, 한 문장 이내), meaning(기술적 의미),
  avoid_points(회피 검토 포인트: "삭제", "치환", "결합방식 변경", "수치범위", "배치 변경" 중 해당하는 것)를 적는다.
- keyLimiting: 권리 범위를 가장 좁히는 핵심 한정 요소의 label.
- reviewIdeas: "검토 아이디어(변리사 검토 전 초안)" — 2~4개 문장. 결론이 아니라 검토할 방향만 적는다.

${GUARDRAILS}`;

export function claimChartUserMessage(p: { appNo: string; title: string; independentClaims: { no: number; text: string }[] }) {
  const claims = p.independentClaims.map((c) => `[제${c.no}항]\n${c.text}`).join("\n\n");
  return `출원번호: ${p.appNo}\n발명의 명칭: ${p.title}\n\n## 독립항\n${claims}`;
}

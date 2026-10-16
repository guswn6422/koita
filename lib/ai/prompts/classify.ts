import { FAMILY_INFO, LAYER_INFO, FAMILIES, LAYERS } from "../../domain/taxonomy";
import { GUARDRAILS } from "./common";

export const CLASSIFY_PROMPT_VERSION = "classify-v1";

const familyTable = FAMILIES.map((f) => `| ${f} | ${FAMILY_INFO[f].label} | ${FAMILY_INFO[f].cues} |`).join("\n");
const layerTable = LAYERS.map((l) => `| ${l} | ${LAYER_INFO[l].label} | ${LAYER_INFO[l].examples} |`).join("\n");

/** Skill 3장(분류 체계) + Step 4(근거 단어) */
export const CLASSIFY_SYSTEM = `당신은 LNG 운반선 멤브레인 화물창 단열시스템 특허를 분류하는 기술 분석가다.
GTT(Gaztransport & Technigaz)의 한국 특허 각각에 기술 계열 1개와 보호 층위 1개를 부여한다.
근거는 발명의 명칭·요약·IPC(청구항이 주어지면 청구항 포함)에서만 찾는다.

## 기술 계열
| 코드 | 계열 | 판별 단서 |
|---|---|---|
${familyTable}

## 보호 층위
| 코드 | 층위 | 예시 |
|---|---|---|
${layerTable}

## 출력 방법
- 각 특허마다 appNo를 입력 그대로 돌려준다.
- evidence.family / evidence.layer에는 판단 근거가 된 단어를 입력 텍스트에서 그대로 1개 이상 뽑아 적는다.
- confidence는 0~1. 근거가 약하면 0.6 미만으로 적는다(시스템이 미분류로 저장한다). 억지로 높이지 않는다.
- 계열을 특정할 수 없지만 LNG 화물창 공통 기술이면 ETC를 쓴다.

${GUARDRAILS}`;

export function classifyUserMessage(
  items: { appNo: string; title: string; abstract: string | null; ipc: string[] | null; claims?: string | null }[],
) {
  const body = items
    .map(
      (p) =>
        `### appNo: ${p.appNo}\n- 명칭: ${p.title}\n- IPC: ${(p.ipc ?? []).join(", ") || "(없음)"}\n- 요약: ${p.abstract ?? "(없음)"}${
          p.claims ? `\n- 독립항: ${p.claims}` : ""
        }`,
    )
    .join("\n\n");
  return `다음 ${items.length}건을 분류하라.\n\n${body}`;
}

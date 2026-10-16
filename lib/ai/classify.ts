import "server-only";
import { z } from "zod";
import { FAMILIES, LAYERS, MIN_CONFIDENCE, type FamilyCode, type LayerCode } from "../domain/taxonomy";
import { structuredCall } from "./llm";
import { CLASSIFY_PROMPT_VERSION, CLASSIFY_SYSTEM, classifyUserMessage } from "./prompts/classify";

const ClassifyResult = z.object({
  results: z.array(
    z.object({
      appNo: z.string(),
      family: z.enum(FAMILIES),
      layer: z.enum(LAYERS),
      evidence: z.object({ family: z.array(z.string()), layer: z.array(z.string()) }),
      confidence: z.number(),
    }),
  ),
});

export type ClassifyInput = { appNo: string; title: string; abstract: string | null; ipc: string[] | null; claims?: string | null };

export type ClassifyOutput = {
  appNo: string;
  family: FamilyCode;
  layer: LayerCode;
  evidence: { family: string[]; layer: string[] };
  confidence: number;
  model: string;
  promptVersion: string;
  error?: string;
};

/** 계열·층위 분류. 신뢰도 0.6 미만·근거 단어 없음·응답 누락은 UNCLASSIFIED로 돌려준다 */
export async function classifyBatch(items: ClassifyInput[]): Promise<ClassifyOutput[]> {
  if (items.length === 0) return [];
  const { data, model, error } = await structuredCall({
    schema: ClassifyResult,
    system: CLASSIFY_SYSTEM,
    user: classifyUserMessage(items),
    effort: "medium",
  });
  const byNo = new Map((data?.results ?? []).map((r) => [r.appNo, r]));

  return items.map((it) => {
    const r = byNo.get(it.appNo);
    const base = { appNo: it.appNo, model, promptVersion: CLASSIFY_PROMPT_VERSION };
    if (!r) {
      return { ...base, family: "UNCLASSIFIED", layer: "UNCLASSIFIED", evidence: { family: [], layer: [] }, confidence: 0, error: error ?? "응답 누락" };
    }
    const confidence = Math.max(0, Math.min(1, r.confidence));
    const weak = confidence < MIN_CONFIDENCE;
    return {
      ...base,
      family: weak || r.evidence.family.length === 0 ? "UNCLASSIFIED" : r.family,
      layer: weak || r.evidence.layer.length === 0 ? "UNCLASSIFIED" : r.layer,
      evidence: r.evidence,
      confidence,
    };
  });
}

/** 비용 관리: 10건씩 나눠 요청 */
export async function classifyAll(items: ClassifyInput[], chunk = 10) {
  const out: ClassifyOutput[] = [];
  for (let i = 0; i < items.length; i += chunk) out.push(...(await classifyBatch(items.slice(i, i + chunk))));
  return out;
}

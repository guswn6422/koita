import "server-only";
import { z } from "zod";
import { AiError, structuredCall } from "./llm";
import { CLAIM_CHART_PROMPT_VERSION, CLAIM_CHART_SYSTEM, claimChartUserMessage } from "./prompts/claim-chart";

export const AVOID_POINTS = ["삭제", "치환", "결합방식 변경", "수치범위", "배치 변경"] as const;

const ClaimChartResult = z.object({
  claimNo: z.number().int(),
  otherIndependent: z.array(z.number().int()),
  elements: z.array(
    z.object({
      label: z.string(),
      gist: z.string(),
      meaning: z.string(),
      avoid_points: z.array(z.enum(AVOID_POINTS)),
    }),
  ),
  keyLimiting: z.string(),
  reviewIdeas: z.string(),
});

export type ClaimChartOutput = z.infer<typeof ClaimChartResult> & { model: string; promptVersion: string };

/** 독립항 구성요소 분해 */
export async function claimChart(p: {
  appNo: string;
  title: string;
  independentClaims: { no: number; text: string }[];
}): Promise<ClaimChartOutput> {
  if (p.independentClaims.length === 0) throw new AiError("분해할 독립항이 없습니다.");
  const { data, model, error } = await structuredCall({
    schema: ClaimChartResult,
    system: CLAIM_CHART_SYSTEM,
    user: claimChartUserMessage(p),
    effort: "high",
  });
  if (!data || data.elements.length === 0) throw new AiError(`청구항 분해 실패: ${error ?? "빈 응답"}`);
  return { ...data, model, promptVersion: CLAIM_CHART_PROMPT_VERSION };
}

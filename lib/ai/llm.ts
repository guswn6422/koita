import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export function claudeModel() {
  return process.env.CLAUDE_MODEL?.trim() || "claude-sonnet-5-5";
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AiError("ANTHROPIC_API_KEY가 설정되지 않아 AI 분류·청구항 분해를 실행할 수 없습니다.");
  }
  client ??= new Anthropic();
  return client;
}

// 서버측 폴백(정책 거절 시 다른 모델로 재실행)을 지원하는 모델
const FALLBACK_MODELS = new Set(["claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"]);

/**
 * 구조화 출력 호출.
 * 기술명세서는 "tool_choice로 강제"를 적었지만 Sonnet 5.5는 강제 tool_choice(any/tool)를 400으로 거부하므로
 * Structured Outputs(output_config.format + Zod)로 같은 목적(JSON만 받기)을 달성한다.
 * Zod 검증 실패 시 1회 재요청하고, 다시 실패하면 null을 돌려 호출 측이 UNCLASSIFIED 등으로 처리한다.
 */
export async function structuredCall<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  user: string;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<{ data: z.infer<S> | null; model: string; error?: string }> {
  const anthropic = getClient();
  const model = claudeModel();
  const useFallback = FALLBACK_MODELS.has(model);
  let lastError = "";

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await anthropic.beta.messages.parse({
        model,
        max_tokens: opts.maxTokens ?? 16000,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        output_config: { effort: opts.effort ?? "medium", format: betaZodOutputFormat(opts.schema) },
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
      if (res.stop_reason === "refusal") {
        lastError = `모델이 요청을 거절했습니다 (${res.stop_details?.category ?? "unknown"})`;
        break; // 거절은 재시도해도 같으므로 중단
      }
      if (res.stop_reason === "max_tokens") {
        lastError = "출력이 max_tokens에서 잘렸습니다";
        continue;
      }
      if (res.parsed_output) return { data: res.parsed_output as z.infer<S>, model };
      lastError = "구조화 출력 검증 실패";
    } catch (e) {
      if (e instanceof Anthropic.AuthenticationError) throw new AiError("ANTHROPIC_API_KEY가 유효하지 않습니다.");
      if (e instanceof Anthropic.RateLimitError) throw new AiError("Claude API 호출 한도에 걸렸습니다. 잠시 후 다시 시도하세요.");
      if (e instanceof Anthropic.APIError) {
        lastError = `Claude API 오류 ${e.status ?? ""}: ${e.message}`;
        if (e.status && e.status < 500) break;
      } else {
        // Zod 파싱 예외 등 → 1회 재요청
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  return { data: null, model, error: lastError };
}

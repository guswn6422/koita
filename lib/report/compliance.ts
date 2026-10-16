/** 법적 표현 통제 (기술명세서 11-4) */
export const DISCLAIMER =
  "본 자료는 공개 특허 정보 기반 1차 기술 검토 자료이며, 침해·회피 판단은 변리사 검토 대상입니다.";

const BANNED = ["침해한다", "침해하지 않는다", "무효"];

/** 고지 문구 자체는 제외하고 금지어를 찾는다 */
export function findBannedTerms(text: string): string[] {
  const body = text.split(DISCLAIMER).join("");
  return BANNED.filter((w) => body.includes(w));
}

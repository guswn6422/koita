import { getDetail } from "./detail";
import { KiprisError, maskKey } from "./client";

/** 연결 테스트용 기본 출원번호 — 2026-10-16 실제 조회로 확인한 GTT 등록 특허 */
export const HEALTH_APP_NO = "1020177026964";

/** detail 1건 조회로 키·파라미터·응답 구조를 점검한다 */
export async function kiprisHealth(appNo = HEALTH_APP_NO) {
  const started = Date.now();
  try {
    const d = await getDetail(appNo);
    return {
      ok: !!d,
      appNo,
      title: d?.title ?? null,
      status: d?.status ?? null,
      claims: d?.claims.length ?? 0,
      ms: Date.now() - started,
      message: d ? "연결 성공" : "응답은 정상이나 서지 정보를 해석하지 못했습니다 (태그 매핑 점검 필요).",
    };
  } catch (e) {
    return {
      ok: false,
      appNo,
      code: e instanceof KiprisError ? e.code : "ERROR",
      ms: Date.now() - started,
      message: e instanceof KiprisError ? e.message : maskKey(e instanceof Error ? e.message : String(e)),
    };
  }
}

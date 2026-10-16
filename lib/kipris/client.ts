import { firstText, parseXml } from "./normalize";

export const KIPRIS_BASE =
  "https://plus.kipris.or.kr/kipo-api/kipi/patUtiModInfoSearchSevice/"; // 'Sevice'는 공식 경로 철자 그대로

export class KiprisError extends Error {
  constructor(public code: string, message: string) {
    super(`KIPRIS 오류 [${code}] ${message}`);
    this.name = "KiprisError";
  }
}

/** 호출 수 누적용 (monitor_runs.api_calls) */
export type CallMeter = { calls: number };

const KEY_RE = /(ServiceKey=)[^&\s]+/gi;
/** 로그·에러 문자열에서 ServiceKey 값을 가린다 */
export function maskKey(text: string) {
  return text.replace(KEY_RE, "$1***");
}

function serviceKey() {
  const k = process.env.KIPRIS_PLUS_API_KEY?.trim();
  if (!k) throw new KiprisError("NO_KEY", "KIPRIS_PLUS_API_KEY 환경변수가 설정되지 않았습니다.");
  // 포털 키가 URL 인코딩돼 있을 수 있으므로 한 번 풀어서 이중 인코딩을 막는다
  try {
    return decodeURIComponent(k);
  } catch {
    return k;
  }
}

const OK_CODES = new Set(["", "0", "00", "000"]);
const INTERVAL_MS = 300;
let lastCall = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** XML 응답 본문에서 resultCode를 판정한다. 정상이 아니면 KiprisError (원문 그대로) */
export function checkResult(xml: string) {
  const doc = parseXml(xml);
  const code = (firstText(doc, "resultCode") ?? "").trim();
  const msg = firstText(doc, "resultMsg") ?? "";
  const success = firstText(doc, "successYN");
  if (!OK_CODES.has(code)) throw new KiprisError(code, msg);
  if (success === "N") throw new KiprisError(code || "99", msg || "successYN=N");
  return doc;
}

/**
 * KIPRIS 오퍼레이션 호출
 * - 300ms 호출 간격, 네트워크 오류·5xx는 지수 백오프로 최대 2회 재시도
 * - 요청 URL 전체는 로그에 남기지 않는다(ServiceKey 포함)
 */
export async function kiprisCall(
  operation: string,
  params: Record<string, string | number>,
  meter?: CallMeter,
) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  qs.set("ServiceKey", serviceKey());
  const url = `${KIPRIS_BASE}${operation}?${qs.toString()}`;

  let attempt = 0;
  for (;;) {
    const wait = lastCall + INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    if (meter) meter.calls++;
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (res.status >= 500) throw new RetryableError(`HTTP ${res.status}`);
      const text = await res.text();
      return { xml: text, doc: checkResult(text) };
    } catch (e) {
      if (e instanceof KiprisError) throw e;
      if (attempt >= 2) {
        const reason = e instanceof Error ? maskKey(e.message) : String(e);
        throw new KiprisError("NETWORK", `KIPRIS 연결 실패: ${reason}`);
      }
      await sleep(500 * 2 ** attempt);
      attempt++;
    }
  }
}

class RetryableError extends Error {}

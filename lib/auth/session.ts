/**
 * 시연용 인증: 공유 비밀번호 + 서명 쿠키 (HMAC-SHA256, Web Crypto)
 * proxy.ts와 Server Action이 같이 쓴다. 운영 확장 시 Auth.js 등으로 교체한다.
 */
export const SESSION_COOKIE = "gtt_session";
export const SESSION_MAX_AGE = 60 * 60 * 12; // 12시간

const enc = new TextEncoder();

async function hmac(data: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET이 설정되지 않았습니다.");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Buffer.from(sig).toString("base64url");
}

/** 값 형식: <만료 epoch초>.<서명> */
export async function createSessionValue(now = Date.now()) {
  const exp = Math.floor(now / 1000) + SESSION_MAX_AGE;
  return `${exp}.${await hmac(String(exp))}`;
}

export async function verifySessionValue(value: string | undefined, now = Date.now()) {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || Number(exp) * 1000 < now) return false;
  const expected = await hmac(exp);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** 길이가 달라도 시간이 크게 차이 나지 않게 비교 */
export function passwordMatches(input: string) {
  const expected = process.env.APP_PASSWORD ?? "";
  if (!expected) return false;
  let diff = input.length ^ expected.length;
  for (let i = 0; i < Math.max(input.length, expected.length); i++) {
    diff |= (input.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

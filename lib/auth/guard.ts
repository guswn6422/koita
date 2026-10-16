import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionValue } from "./session";

/** Server Action·Route Handler 안에서 한 번 더 세션을 확인한다 (proxy만 믿지 않는다) */
export async function requireSession() {
  const store = await cookies();
  if (!(await verifySessionValue(store.get(SESSION_COOKIE)?.value))) {
    throw new Error("로그인이 필요합니다.");
  }
}

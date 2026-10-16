import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionValue } from "./lib/auth/session";

/**
 * 인증 게이트 (Next.js 16의 middleware 대체 파일)
 * - /login, /api/cron/* 외 모든 경로에 세션 확인
 * - Cron 경로는 Route Handler에서 CRON_SECRET으로만 통과시킨다
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/cron/")) return NextResponse.next();

  const ok = await verifySessionValue(request.cookies.get(SESSION_COOKIE)?.value).catch(() => false);
  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const url = new URL("/login", request.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};

import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { SideNav, TopNav } from "@/components/nav";
import { dbKind } from "@/lib/db";
import { DISCLAIMER } from "@/lib/report/compliance";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const kind = await dbKind();
  return (
    <div className="flex min-h-screen flex-col">
      {/* GNB */}
      <header className="bg-navy text-white shadow-[0_1px_0_rgba(0,0,0,.2)]">
        <div className="h-[3px] bg-gradient-to-r from-blue via-sky to-blue" />
        <div className="flex h-14 items-center justify-between gap-4 px-4 lg:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-white/10 text-[13px] font-black tracking-tight ring-1 ring-white/25">
              IP
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-bold leading-tight">GTT 특허 모니터링 시스템</span>
              <span className="hidden text-[11px] text-white/65 sm:block">LNG 화물창 단열시스템 · 한국 특허(KIPRIS) 1차 기술 검토</span>
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-3 text-[12px]">
            <span
              className={`hidden rounded-sm px-2 py-1 font-semibold sm:inline ${kind === "neon" ? "bg-white/10" : "bg-[#d98a2b]/90"}`}
              title={kind === "neon" ? "Neon Postgres 연결" : "DATABASE_URL 미설정 — 로컬 데모 DB(PGlite)"}
            >
              DB · {kind === "neon" ? "Neon" : "로컬 데모"}
            </span>
            <form action={logoutAction}>
              <button className="rounded-sm border border-white/30 px-2.5 py-1 text-white/90 hover:bg-white/10">로그아웃</button>
            </form>
          </div>
        </div>
        <div className="px-2"><TopNav /></div>
      </header>

      <div className="flex flex-1">
        {/* LNB */}
        <aside className="hidden w-56 shrink-0 border-r border-line bg-white lg:block">
          <SideNav />
          <div className="mx-4 mt-4 border border-line bg-[#f7f9fc] p-3 text-[12px] leading-relaxed text-ink-2">
            <b className="text-navy">검토 원칙</b>
            <br />
            규칙은 코드, 판단은 LLM,
            <br />
            사실은 API.
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 lg:px-7">{children}</main>
      </div>

      {/* 법적 고지 — 모든 페이지 하단 고정 */}
      <footer className="sticky bottom-0 z-10 border-t border-line bg-white/95 px-4 py-2 text-center text-[12px] text-ink-2 backdrop-blur lg:px-7">
        ⚖️ {DISCLAIMER}
      </footer>
    </div>
  );
}

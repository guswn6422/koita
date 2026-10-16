import { LoginForm } from "./login-form";
import { DISCLAIMER } from "@/lib/report/compliance";

export const metadata = { title: "로그인 · GTT 특허 모니터링 시스템" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col bg-[linear-gradient(160deg,#0f2440_0%,#1e3a5f_55%,#1a56a4_100%)]">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[400px] bg-white shadow-[0_20px_50px_rgba(0,0,0,.25)]">
          <div className="border-b-2 border-navy px-7 pb-5 pt-7">
            <div className="text-[12px] font-semibold tracking-wider text-blue">IP INTELLIGENCE</div>
            <h1 className="mt-1 text-[20px] font-bold text-navy-900">GTT 특허 모니터링 시스템</h1>
            <p className="mt-1 text-[13px] text-ink-3">LNG 화물창 단열시스템 · 한국 특허 1차 기술 검토</p>
          </div>
          <div className="px-7 py-6">
            <LoginForm next={next ?? "/"} />
            <p className="mt-5 text-[12px] leading-relaxed text-ink-3">
              시연용 공유 비밀번호로 로그인합니다. 이 시스템은 공개 특허 정보만 다루며, 자사 설계 자료는 회사 승인 환경에서만 다룹니다.
            </p>
          </div>
        </div>
      </div>
      <p className="px-4 pb-5 text-center text-[12px] text-white/70">{DISCLAIMER}</p>
    </div>
  );
}

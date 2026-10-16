"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label className="text-[13px] font-semibold text-ink-2" htmlFor="password">
        비밀번호
      </label>
      <input id="password" name="password" type="password" required autoFocus className="input h-10 w-full" autoComplete="current-password" />
      {state && !state.ok && <div className="notice notice-err">{state.message}</div>}
      <button className="btn btn-dark mt-1 h-10 w-full text-[14px]" disabled={pending}>
        {pending && <span className="spinner" aria-hidden />}
        로그인
      </button>
    </form>
  );
}

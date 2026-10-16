"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

function Submit({ label, pendingLabel, className, confirm }: { label: ReactNode; pendingLabel?: string; className: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && <span className="spinner" aria-hidden />}
      {pending ? pendingLabel ?? "실행 중…" : label}
    </button>
  );
}

export function ResultNotice({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <div className={`notice ${state.ok ? "notice-ok" : "notice-err"} mt-2`} role="status">
      <div className="font-semibold">{state.message}</div>
      {state.lines?.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

/**
 * 버튼 하나로 Server Action을 실행하고 결과를 아래에 보여준다 (비개발자 시연용).
 * children에는 hidden input이나 입력 필드를 넣는다.
 */
export function ActionForm({
  action, label, pendingLabel, className = "btn btn-primary", confirm, children, layout = "inline", resultClass = "",
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  label: ReactNode;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
  children?: ReactNode;
  layout?: "inline" | "stack";
  resultClass?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <div className={resultClass}>
      <form action={formAction} className={layout === "inline" ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-2"}>
        {children}
        <div>
          <Submit label={label} pendingLabel={pendingLabel} className={className} confirm={confirm} />
        </div>
      </form>
      <ResultNotice state={state} />
    </div>
  );
}

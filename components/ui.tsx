import Link from "next/link";
import type { ReactNode } from "react";
import { RISK_LABEL, type RiskLevel } from "@/lib/domain/risk";
import { STATUS_GROUP_LABEL, type StatusGroup } from "@/lib/domain/status";
import { familyLabel, layerLabel } from "@/lib/domain/taxonomy";

export function PageHeader({ crumbs, title, desc, actions }: { crumbs: string[]; title: string; desc?: string; actions?: ReactNode }) {
  return (
    <div className="page-title">
      <div>
        <div className="breadcrumb">
          홈{crumbs.map((c, i) => (
            <span key={i}> &gt; {i === crumbs.length - 1 ? <b>{c}</b> : c}</span>
          ))}
        </div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, right, children, className = "", bodyClass = "panel-body" }: {
  title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-head">
          <h2>{title}</h2>
          {right}
        </div>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

const RISK_CLASS: Record<RiskLevel, string> = { HIGH: "b-high", MID: "b-mid", LOW: "b-low" };
const RISK_DOT: Record<RiskLevel, string> = { HIGH: "🔴", MID: "🟡", LOW: "🟢" };

/** 위험도 배지 — 잠정 등급은 점선 테두리, 층위 미분류는 "분류 필요" */
export function RiskBadge({ risk, provisional }: { risk: RiskLevel | null; provisional?: boolean }) {
  if (!risk) return <span className="badge b-none" title="층위가 미분류라 위험도를 계산하지 않았습니다">분류 필요</span>;
  return (
    <span className={`badge ${RISK_CLASS[risk]} ${provisional ? "b-provisional" : ""}`} title={provisional ? "청구항 미분해 또는 미검증 — 잠정 등급" : undefined}>
      <span aria-hidden>{RISK_DOT[risk]}</span>
      {RISK_LABEL[risk]}
      {provisional && <span className="font-normal">(잠정)</span>}
    </span>
  );
}

export function StatusBadge({ status, group }: { status: string | null; group: StatusGroup | null }) {
  const g = group ?? "pending";
  return (
    <span className={`badge b-${g}`} title={STATUS_GROUP_LABEL[g]}>
      {status ?? "-"}
    </span>
  );
}

export function GroupBadge({ group }: { group: StatusGroup | null }) {
  const g = group ?? "pending";
  return <span className={`badge b-${g}`}>{STATUS_GROUP_LABEL[g]}</span>;
}

const VERIFIED_LABEL = { API: "API", WEB: "웹확인", UNVERIFIED: "미검증" } as const;
export function VerifiedBadge({ v }: { v: keyof typeof VERIFIED_LABEL }) {
  return <span className={`badge ${v === "API" ? "b-api" : "b-gray"}`}>{VERIFIED_LABEL[v]}</span>;
}

export function ClassChip({ family, layer }: { family: string; layer: string }) {
  if (family === "UNCLASSIFIED" && layer === "UNCLASSIFIED") return <span className="badge b-none">분류 필요</span>;
  return (
    <span className="whitespace-nowrap text-[13px]" title={`${familyLabel(family)} · ${layerLabel(layer)}`}>
      <b className="text-navy">{family === "UNCLASSIFIED" ? "미분류" : family}</b>
      <span className="text-ink-3"> · </span>
      <span>{layer === "UNCLASSIFIED" ? "미분류" : layer}</span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-10 text-center text-[13px] text-ink-3">{children}</div>;
}

export function fmtAppNo(n: string) {
  return /^\d{13}$/.test(n) ? `${n.slice(0, 2)}-${n.slice(2, 6)}-${n.slice(6)}` : n;
}

export function fmtDateTime(d: Date | string | null | undefined) {
  if (!d) return "-";
  const t = new Date(d);
  return new Date(t.getTime() + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
}

export function PatentLink({ appNo }: { appNo: string }) {
  return (
    <Link className="link whitespace-nowrap" href={`/patents/${encodeURIComponent(appNo)}`}>
      {fmtAppNo(appNo)}
    </Link>
  );
}

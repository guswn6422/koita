import Link from "next/link";
import { collectAction, classifyAction, monitorAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { DistributionBars, YearTrend } from "@/components/charts";
import { GROUP_COLORS, GROUP_LABELS } from "@/lib/ui/palette";
import { Empty, PageHeader, Panel, PatentLink, RiskBadge, fmtDateTime } from "@/components/ui";
import { getDb } from "@/lib/db";
import { dashboardStats } from "@/lib/db/queries";
import { EVENT_LABEL } from "@/lib/domain/diff";
import { FAMILIES, LAYERS, FAMILY_INFO, LAYER_INFO } from "@/lib/domain/taxonomy";

export const maxDuration = 300;

export default async function DashboardPage() {
  const s = await dashboardStats(await getDb());
  const { kpi } = s;
  const famMap = new Map(s.byFamily.map((r) => [r.key, r.n]));
  const layMap = new Map(s.byLayer.map((r) => [r.key, r.n]));
  const familyData = [...FAMILIES, "UNCLASSIFIED" as const].map((f) => ({
    key: f, label: f === "UNCLASSIFIED" ? "미분류" : f === "NO96" ? "NO96 / GT" : `${f} · ${FAMILY_INFO[f].short}`, n: famMap.get(f) ?? 0,
  }));
  const layerData = [...LAYERS, "UNCLASSIFIED" as const].map((l) => ({
    key: l, label: l === "UNCLASSIFIED" ? "미분류" : `${l} ${LAYER_INFO[l].label}`, n: layMap.get(l) ?? 0,
  }));
  const years = new Map<number, { year: number; valid: number; pending: number; inactive: number }>();
  for (const r of s.byYear) {
    if (!r.year) continue;
    const row = years.get(r.year) ?? { year: r.year, valid: 0, pending: 0, inactive: 0 };
    row[(r.group ?? "pending") as "valid"] += r.n;
    years.set(r.year, row);
  }
  const thisYear = new Date().getFullYear();
  const trend = [...years.values()].filter((y) => y.year >= thisYear - 14).sort((a, b) => a.year - b.year);
  const total = kpi.total || 1;

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={["대시보드"]}
        title="대시보드"
        desc="GTT가 한국에 어디에 권리를 쌓고 있는가 — 상태·계열·층위 분포와 최근 감지 이벤트"
        actions={
          <>
            <a className="btn btn-line" href="/api/export/summary">요약 보고서(.md)</a>
            <Link className="btn btn-line" href="/patents">특허 목록</Link>
          </>
        }
      />

      {kpi.total === 0 || kpi.notApi === kpi.total ? (
        <div className="notice notice-info">
          아직 KIPRIS에서 수집한 데이터가 없습니다. 아래 <b>전체 수집</b>을 실행하면 출원인 별칭별로 검색해 기준 DB를 만듭니다.
          (현재 {kpi.total}건은 부록 B의 웹 확인 시드입니다)
        </div>
      ) : null}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="총 건수" value={kpi.total} sub={`API 미검증 ${kpi.notApi}건 · 분류 필요 ${kpi.unclassified}건`} />
        <Kpi label="유효 권리 (등록)" value={kpi.valid} sub="회피 검토 최우선" accent={GROUP_COLORS.valid} />
        <Kpi label="잠재 권리 (공개·심사중)" value={kpi.pending} sub="청구항 보정 가능 — 모니터링 대상" accent={GROUP_COLORS.pending} />
        <Kpi label="위험도 상" value={kpi.high} sub="등록 + L1·L2 + 넓은 독립항" accent="#c62828" href="/patents?risk=HIGH&sort=risk" />
      </div>

      {/* 실행 버튼 */}
      <Panel title="빠른 실행" right={<span className="text-[12px] text-ink-3">버튼 하나로 수집 → 분류 → 모니터링</span>}>
        <div className="grid gap-4 md:grid-cols-3">
          <RunCard step="1" title="전체 수집 (collect)" desc="활성 별칭 전체를 KIPRIS로 검색해 정규화·중복 제거 후 반영합니다. 남은 시간 안에서 AI 분류까지 진행합니다.">
            <ActionForm action={collectAction} label="전체 수집 실행" pendingLabel="KIPRIS 수집 중…" />
          </RunCard>
          <RunCard step="2" title="미분류 일괄 분류" desc="분류 이력이 없는 건을 10건씩 Claude로 계열·층위 분류하고 위험도 규칙을 적용합니다.">
            <ActionForm action={classifyAction} label="30건 분류" pendingLabel="AI 분류 중…" className="btn btn-dark">
              <input type="hidden" name="limit" value="30" />
            </ActionForm>
          </RunCard>
          <RunCard step="3" title="모니터링 (monitor)" desc="같은 검색을 다시 실행해 기준과 비교하고 신규·상태변경·등록번호 부여를 기록합니다.">
            <ActionForm action={monitorAction} label="지금 실행" pendingLabel="모니터링 중…" className="btn btn-line" />
          </RunCard>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="법적상태 분포">
          <StatusStack valid={kpi.valid} pending={kpi.pending} inactive={kpi.inactive} total={total} />
          <h3 className="mb-1 mt-6 text-[13px] font-semibold text-ink-2">연도별 출원 추이 (최근 15년)</h3>
          {trend.length ? <YearTrend data={trend} /> : <Empty>출원일이 있는 데이터가 없습니다.</Empty>}
        </Panel>
        <div className="grid gap-5">
          <Panel title="기술 계열 분포">
            <DistributionBars data={familyData} />
          </Panel>
          <Panel title="보호 층위 분포">
            <DistributionBars data={layerData} height={180} />
          </Panel>
        </div>
      </div>

      <Panel
        title="최근 모니터링 이벤트"
        bodyClass=""
        right={
          <span className="text-[12px] text-ink-3">
            마지막 회차: {s.lastRun ? `#${s.lastRun.id} · ${s.lastRun.state} · ${fmtDateTime(s.lastRun.startedAt)}` : "없음"}
            <Link className="ml-3 font-semibold text-blue" href="/monitor">전체 보기 →</Link>
          </span>
        }
      >
        {s.recentEvents.length === 0 ? (
          <Empty>아직 감지된 이벤트가 없습니다. 모니터링을 실행하세요.</Empty>
        ) : (
          <div className="grid-wrap">
            <table className="dgrid">
              <thead>
                <tr><th>구분</th><th>출원번호</th><th>발명의 명칭</th><th>변경</th><th>위험도</th><th>감지 시각</th></tr>
              </thead>
              <tbody>
                {s.recentEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="c"><span className={`badge ${e.type === "NEW" ? "b-navy" : "b-valid"}`}>{EVENT_LABEL[e.type]}</span></td>
                    <td className="c">{e.title ? <PatentLink appNo={e.appNo} /> : e.appNo}</td>
                    <td>{e.title ?? "-"}</td>
                    <td className="c text-[12px] text-ink-2">{e.type === "NEW" ? e.after ?? "-" : `${e.before ?? "(없음)"} → ${e.after ?? "(없음)"}`}</td>
                    <td className="c"><RiskBadge risk={e.risk} /></td>
                    <td className="c text-[12px]">{fmtDateTime(e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function Kpi({ label, value, sub, accent, href }: { label: string; value: number; sub: string; accent?: string; href?: string }) {
  const body = (
    <div className="kpi h-full" style={accent ? { borderTopColor: accent } : undefined}>
      <div className="label">{label}</div>
      <div className="value">{value.toLocaleString()}<span className="ml-1 text-[14px] font-semibold text-ink-3">건</span></div>
      <div className="sub">{sub}</div>
    </div>
  );
  return href ? <Link href={href} className="block hover:brightness-[.98]">{body}</Link> : body;
}

function RunCard({ step, title, desc, children }: { step: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border border-line-soft bg-[#fafbfd] p-4" style={{ borderColor: "var(--line-soft)" }}>
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center bg-navy text-[12px] font-bold text-white">{step}</span>
        <b className="text-[14px] text-navy-900">{title}</b>
      </div>
      <p className="min-h-[40px] text-[12.5px] leading-relaxed text-ink-2">{desc}</p>
      {children}
    </div>
  );
}

/** 100% 누적 막대 + 항상 보이는 수치 범례 (색만으로 구분하지 않음) */
function StatusStack({ valid, pending, inactive, total }: { valid: number; pending: number; inactive: number; total: number }) {
  const parts = [
    { k: "valid" as const, n: valid },
    { k: "pending" as const, n: pending },
    { k: "inactive" as const, n: inactive },
  ];
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded-[4px] bg-[#eef2f7]" role="img" aria-label={parts.map((p) => `${GROUP_LABELS[p.k]} ${p.n}건`).join(", ")}>
        {parts.filter((p) => p.n > 0).map((p) => (
          <div key={p.k} title={`${GROUP_LABELS[p.k]} ${p.n}건`} style={{ width: `${(p.n / total) * 100}%`, background: GROUP_COLORS[p.k] }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <Link key={p.k} href={`/patents?group=${p.k}`} className="flex items-center gap-2 text-[13px] hover:underline">
            <span className="h-3 w-3 shrink-0 rounded-[2px]" style={{ background: GROUP_COLORS[p.k] }} />
            <span className="text-ink-2">{GROUP_LABELS[p.k]}</span>
            <b className="ml-auto tabular-nums text-ink">{p.n}</b>
            <span className="text-[12px] text-ink-3">{Math.round((p.n / total) * 100)}%</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

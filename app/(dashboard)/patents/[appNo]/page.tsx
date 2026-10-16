import Link from "next/link";
import { notFound } from "next/navigation";
import { analyzeAction, manualClassifyAction, reclassifyAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import {
  ClassChip, Empty, GroupBadge, PageHeader, Panel, RiskBadge, StatusBadge, VerifiedBadge, fmtAppNo, fmtDateTime,
} from "@/components/ui";
import { getDb } from "@/lib/db";
import { getPatentDetail, getSettings } from "@/lib/db/queries";
import { EVENT_LABEL } from "@/lib/domain/diff";
import { FAMILIES, LAYERS, FAMILY_INFO, LAYER_INFO, familyLabel, layerLabel } from "@/lib/domain/taxonomy";

export const maxDuration = 300;

export default async function PatentDetailPage({ params }: { params: Promise<{ appNo: string }> }) {
  const appNo = decodeURIComponent((await params).appNo);
  const db = await getDb();
  const d = await getPatentDetail(db, appNo);
  if (!d) notFound();
  const settings = await getSettings(db);
  const { patent: p, classHistory, charts, history, events } = d;
  const cls = classHistory[0];
  const chart = charts[0];
  const structuralValid = p.statusGroup === "valid" && (p.layer === "L1" || p.layer === "L2");

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={["특허 목록", "특허 상세"]}
        title={p.title}
        desc={`출원번호 ${fmtAppNo(p.appNo)} · ${p.applicant ?? "-"}`}
        actions={
          <>
            <Link className="btn btn-line" href="/patents">목록</Link>
            {chart && <a className="btn btn-primary" href={`/api/export/claim-chart/${encodeURIComponent(p.appNo)}`}>청구항 분해표(.md)</a>}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={p.status} group={p.statusGroup} />
        <GroupBadge group={p.statusGroup} />
        <ClassChip family={p.family} layer={p.layer} />
        <RiskBadge risk={p.risk} provisional={p.riskProvisional} />
        <VerifiedBadge v={p.verified} />
        {p.verified !== "API" && (
          <span className="text-[12px] text-ink-3">KIPRIS로 재확인 전까지 번호·상태·위험도는 잠정입니다.</span>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr]">
        <Panel title="서지 정보" bodyClass="">
          <table className="kv">
            <tbody>
              <tr><th>출원번호 / 출원일</th><td>{fmtAppNo(p.appNo)} / {p.appDate ?? "-"}</td></tr>
              <tr><th>공개번호 / 공개일</th><td>{p.pubNo ?? "-"} / {p.pubDate ?? "-"}</td></tr>
              <tr><th>등록번호 / 등록일</th><td>{p.regNo ?? "-"} / {p.regDate ?? "-"}</td></tr>
              <tr><th>법적상태</th><td>{p.status ?? "-"}</td></tr>
              <tr><th>출원인</th><td>{p.applicant ?? "-"}</td></tr>
              <tr><th>IPC</th><td>{p.ipc?.join(", ") || "-"}</td></tr>
              <tr><th>최초 수집 / 확인</th><td>{fmtDateTime(p.firstSeen)} / {fmtDateTime(p.lastChecked)}</td></tr>
            </tbody>
          </table>
          <div className="panel-body text-[13.5px] leading-relaxed text-ink-2">
            <b className="text-ink">요약</b>
            <p className="mt-1 whitespace-pre-line">{p.abstract ?? "요약 정보가 없습니다."}</p>
          </div>
        </Panel>

        <Panel
          title="분류 결과와 근거"
          right={<ActionForm action={reclassifyAction} label="AI 재분류" pendingLabel="분류 중…" className="btn btn-line btn-sm"><input type="hidden" name="appNo" value={p.appNo} /></ActionForm>}
        >
          <table className="kv mb-4">
            <tbody>
              <tr><th>기술 계열</th><td><b className="text-navy">{p.family}</b> · {familyLabel(p.family)}</td></tr>
              <tr><th>보호 층위</th><td><b className="text-navy">{p.layer}</b> · {layerLabel(p.layer)}</td></tr>
              <tr>
                <th>근거 단어</th>
                <td>
                  {cls?.evidence && (cls.evidence.family.length || cls.evidence.layer.length) ? (
                    <div className="flex flex-wrap gap-1.5">
                      {cls.evidence.family.map((w) => <span key={`f-${w}`} className="badge b-valid">계열: {w}</span>)}
                      {cls.evidence.layer.map((w) => <span key={`l-${w}`} className="badge b-pending">층위: {w}</span>)}
                    </div>
                  ) : (
                    <span className="text-ink-3">{cls ? "근거 단어 없음" : "분류 이력 없음"}</span>
                  )}
                </td>
              </tr>
              <tr>
                <th>출처 / 신뢰도</th>
                <td className="text-[13px]">
                  {cls ? (
                    <>
                      <span className={`badge ${cls.source === "MANUAL" ? "b-navy" : "b-gray"}`}>{cls.source === "MANUAL" ? "수동" : "AI"}</span>{" "}
                      {cls.confidence ? `신뢰도 ${Number(cls.confidence).toFixed(2)}` : ""} {cls.model ? `· ${cls.model} (${cls.promptVersion})` : ""}
                      {cls.note && <div className="mt-1 text-[12px] text-ink-3">{cls.note}</div>}
                    </>
                  ) : "-"}
                </td>
              </tr>
            </tbody>
          </table>

          <details className="border border-line bg-[#fafbfd] p-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-navy">수동 분류 수정 (AI 결과보다 우선)</summary>
            <ActionForm action={manualClassifyAction} label="저장" className="btn btn-dark" layout="stack" resultClass="mt-3">
              <input type="hidden" name="appNo" value={p.appNo} />
              <div className="grid gap-2 sm:grid-cols-2">
                <select name="family" defaultValue={p.family} className="select" aria-label="계열">
                  {FAMILIES.map((x) => <option key={x} value={x}>{x} · {FAMILY_INFO[x].label}</option>)}
                  <option value="UNCLASSIFIED">미분류</option>
                </select>
                <select name="layer" defaultValue={p.layer} className="select" aria-label="층위">
                  {LAYERS.map((x) => <option key={x} value={x}>{x} · {LAYER_INFO[x].label}</option>)}
                  <option value="UNCLASSIFIED">미분류</option>
                </select>
              </div>
              <input name="note" className="input" placeholder="수정 근거 메모 (선택)" />
            </ActionForm>
          </details>

          {classHistory.length > 1 && (
            <div className="mt-4">
              <div className="mb-1 text-[12px] font-semibold text-ink-2">분류 이력</div>
              <ul className="space-y-1 text-[12px] text-ink-2">
                {classHistory.map((c) => (
                  <li key={c.id}>
                    {fmtDateTime(c.createdAt)} · {c.source} · {c.family} · {c.layer}
                    {c.confidence ? ` · ${Number(c.confidence).toFixed(2)}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="청구항 분해 (구성요소 완비 원칙)"
        right={
          <span className="text-[12px] text-ink-3">
            요소 수 ≤ {settings.high_max_elements}개면 넓은 권리로 보아 위험도 상 (등록 + L1·L2)
          </span>
        }
      >
        <div className="notice notice-info mb-4">
          독립항의 <b>모든 구성요소를 갖춰야</b> 권리 범위에 들어갑니다. 따라서 각 요소가 회피 설계 검토의 지렛대가 되며,
          가장 좁히는 <b>핵심 한정 요소</b>가 우선 검토 대상입니다. 아래 내용은 변리사 검토 전 초안입니다.
        </div>

        {chart ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-ink-2">
              <span>독립항: <b className="text-ink">제{chart.claimNo}항</b></span>
              <span>그 외 독립항: {chart.otherIndependent?.length ? chart.otherIndependent.map((n) => `제${n}항`).join(", ") : "없음"}</span>
              <span>구성요소 {chart.elementCount}개</span>
              <span>청구항 출처: {chart.claimSource === "API" ? "KIPRIS 서지상세" : "직접 입력"}</span>
              <span>{chart.model} · {chart.promptVersion} · {fmtDateTime(chart.createdAt)}</span>
            </div>
            <div className="grid-wrap border border-line">
              <table className="dgrid">
                <thead><tr><th>요소</th><th className="min-w-[240px]">청구항 문언(요지)</th><th className="min-w-[200px]">기술적 의미</th><th>회피 검토 포인트</th></tr></thead>
                <tbody>
                  {chart.elements.map((e) => {
                    const key = e.label === chart.keyLimiting;
                    return (
                      <tr key={e.label} className={key ? "bg-[#fff8e6]" : ""}>
                        <td className="c">
                          <b className={key ? "text-[#8a5a00]" : "text-navy"}>{e.label}</b>
                          {key && <div className="text-[11px] font-semibold text-[#8a5a00]">핵심 한정</div>}
                        </td>
                        <td>{e.gist}</td>
                        <td className="text-ink-2">{e.meaning}</td>
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {e.avoid_points.map((a) => <span key={a} className="badge b-gray">{a}</span>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border border-line bg-[#fafbfd] p-3 text-[13.5px] leading-relaxed">
              <b className="text-navy">검토 아이디어 (변리사 검토 전 초안)</b>
              <p className="mt-1 whitespace-pre-line text-ink-2">{chart.reviewIdeas}</p>
            </div>
          </div>
        ) : (
          <Empty>
            아직 분해하지 않았습니다.{structuralValid ? " 이 특허는 등록 + 구조 층위라 위험도가 잠정 '상'입니다 — 분해로 확정하세요." : ""}
          </Empty>
        )}

        <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 lg:flex-row lg:items-start">
          <div className="lg:w-72">
            <ActionForm action={analyzeAction} label={chart ? "KIPRIS 청구항으로 다시 분해" : "KIPRIS 청구항으로 분해"} pendingLabel="청구항 조회·분해 중…">
              <input type="hidden" name="appNo" value={p.appNo} />
            </ActionForm>
          </div>
          <details className="flex-1 border border-line bg-[#fafbfd] p-3">
            <summary className="cursor-pointer text-[13px] font-semibold text-navy">청구항을 직접 붙여넣어 분해 (API에 청구항이 없을 때)</summary>
            <ActionForm action={analyzeAction} label="입력한 독립항으로 분해" className="btn btn-dark" layout="stack" resultClass="mt-3">
              <input type="hidden" name="appNo" value={p.appNo} />
              <textarea name="claimText" rows={6} className="textarea w-full" placeholder={"1. ...을 포함하는 밀봉 단열 탱크로서, ...\n2. 제1항에 있어서, ..."} required />
            </ActionForm>
          </details>
        </div>
        {charts.length > 1 && <p className="mt-2 text-[12px] text-ink-3">이전 분해 결과 {charts.length - 1}건이 이력으로 보존돼 있습니다.</p>}
      </Panel>

      <Panel title="상태 이력">
        {history.length === 0 && events.length === 0 ? (
          <Empty>기록된 상태 변경이 없습니다.</Empty>
        ) : (
          <ol className="relative ml-2 space-y-3 border-l-2 border-line pl-5">
            {events.map((e) => (
              <li key={`e${e.id}`} className="relative">
                <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-blue" />
                <div className="text-[12px] text-ink-3">{fmtDateTime(e.createdAt)} · 회차 <Link className="text-blue" href={`/monitor/${e.runId}`}>#{e.runId}</Link></div>
                <div className="text-[13.5px]">
                  <b>{EVENT_LABEL[e.type]}</b> {e.type === "NEW" ? `(${e.after ?? "-"})` : `${e.before ?? "(없음)"} → ${e.after ?? "(없음)"}`}
                </div>
              </li>
            ))}
            {history
              .filter((h) => !h.runId)
              .map((h) => (
                <li key={`h${h.id}`} className="relative">
                  <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-sky" />
                  <div className="text-[12px] text-ink-3">{fmtDateTime(h.detectedAt)} · 수집</div>
                  <div className="text-[13.5px]">
                    <b>{h.field === "status" ? "상태변경" : "등록번호 부여"}</b> {h.before ?? "(없음)"} → {h.after ?? "(없음)"}
                  </div>
                </li>
              ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}

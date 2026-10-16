import Link from "next/link";
import { ackEventAction, demoDeleteAction, monitorAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ClassChip, Empty, PageHeader, Panel, PatentLink, RiskBadge, fmtDateTime } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listEvents, listRuns } from "@/lib/db/queries";
import { EVENT_LABEL } from "@/lib/domain/diff";

export const maxDuration = 300;

const STATE_CLASS = { DONE: "b-low", RUNNING: "b-pending", PARTIAL: "b-mid", FAILED: "b-high" } as const;
const STATE_LABEL = { DONE: "완료", RUNNING: "실행 중", PARTIAL: "일부 완료", FAILED: "실패" } as const;

export default async function MonitorPage() {
  const db = await getDb();
  const [runs, events] = await Promise.all([listRuns(db), listEvents(db, { limit: 100 })]);
  const open = events.filter((e) => !e.acknowledged).length;
  const partial = runs.find((r) => r.state === "PARTIAL");

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={["모니터링"]}
        title="모니터링"
        desc="매주 월요일 07:00 KST(Vercel Cron) 자동 실행 · 기준 DB와 비교해 신규 / 상태변경 / 등록번호 부여를 감지"
      />

      <Panel title="실행">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <p className="text-[13px] text-ink-2">
              수동 실행은 Cron과 같은 로직을 돌립니다. 시간 제한에 걸리면 <b>일부 완료</b>로 끝나고, 다시 누르면 중단 지점부터 이어서 실행합니다.
            </p>
            <ActionForm action={monitorAction} label={partial ? `회차 #${partial.id} 이어서 실행` : "지금 실행"} pendingLabel="KIPRIS 조회·비교 중…" />
          </div>
          <div className="space-y-2 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
            <p className="text-[13px] text-ink-2">
              <b>시연 시나리오</b> — 기준 DB에서 최근 출원 1건을 지운 뒤 &quot;지금 실행&quot;을 누르면 <b>신규 1건 감지</b> 장면을 보여줄 수 있습니다.
            </p>
            <ActionForm
              action={demoDeleteAction}
              label="시연 준비: 기준에서 1건 삭제"
              className="btn btn-danger-line"
              confirm="기준 DB에서 최근 출원 1건과 그 분류·분해 기록을 삭제합니다. 계속할까요?"
            />
          </div>
        </div>
      </Panel>

      <Panel title="회차 목록" bodyClass="">
        {runs.length === 0 ? (
          <Empty>아직 실행된 회차가 없습니다.</Empty>
        ) : (
          <div className="grid-wrap">
            <table className="dgrid">
              <thead>
                <tr><th>회차</th><th>트리거</th><th>시작 (KST)</th><th>종료</th><th>상태</th><th>조회</th><th>신규</th><th>변경</th><th>위험도 상</th><th>KIPRIS 호출</th><th>오류</th><th>보고서</th></tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="c"><Link className="link" href={`/monitor/${r.id}`}>#{r.id}</Link></td>
                    <td className="c"><span className={`badge ${r.trigger === "CRON" ? "b-navy" : "b-gray"}`}>{r.trigger === "CRON" ? "Cron" : "수동"}</span></td>
                    <td className="c whitespace-nowrap">{fmtDateTime(r.startedAt)}</td>
                    <td className="c whitespace-nowrap">{fmtDateTime(r.finishedAt)}</td>
                    <td className="c"><span className={`badge ${STATE_CLASS[r.state]}`}>{STATE_LABEL[r.state]}</span></td>
                    <td className="num">{r.stats?.fetched ?? 0}</td>
                    <td className="num font-semibold">{r.stats?.added ?? 0}</td>
                    <td className="num">{r.stats?.changed ?? 0}</td>
                    <td className="num">{r.stats?.high ?? 0}</td>
                    <td className="num">{r.apiCalls}</td>
                    <td className="max-w-[260px] truncate text-[12px] text-[#8e1d1d]" title={r.error ?? ""}>{r.error ?? ""}</td>
                    <td className="c">
                      <a className="btn btn-line btn-sm" href={`/api/export/report/${r.id}`}>.md</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel
        title={`감지 이벤트 (미확인 ${open}건)`}
        bodyClass=""
        right={
          open > 0 && (
            <form action={ackEventAction}>
              <input type="hidden" name="all" value="1" />
              <button className="btn btn-line btn-sm">모두 확인 처리</button>
            </form>
          )
        }
      >
        {events.length === 0 ? (
          <Empty>감지된 이벤트가 없습니다.</Empty>
        ) : (
          <div className="grid-wrap">
            <table className="dgrid">
              <thead>
                <tr><th>회차</th><th>구분</th><th>출원번호</th><th className="min-w-[240px]">발명의 명칭</th><th>변경 내용</th><th>계열·층위</th><th>위험도</th><th>확인</th></tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className={e.acknowledged ? "text-ink-3" : ""}>
                    <td className="c"><Link className="link" href={`/monitor/${e.runId}`}>#{e.runId}</Link></td>
                    <td className="c"><span className={`badge ${e.type === "NEW" ? "b-navy" : "b-valid"}`}>{EVENT_LABEL[e.type]}</span></td>
                    <td className="c">{e.title ? <PatentLink appNo={e.appNo} /> : e.appNo}</td>
                    <td>{e.title ?? "-"}</td>
                    <td className="c text-[12px]">{e.type === "NEW" ? e.after ?? "-" : `${e.before ?? "(없음)"} → ${e.after ?? "(없음)"}`}</td>
                    <td className="c">{e.family && <ClassChip family={e.family} layer={e.layer!} />}</td>
                    <td className="c"><RiskBadge risk={e.risk} provisional={e.riskProvisional ?? false} /></td>
                    <td className="c">
                      {e.acknowledged ? (
                        <span className="text-[12px]">확인됨</span>
                      ) : (
                        <form action={ackEventAction}>
                          <input type="hidden" name="id" value={e.id} />
                          <button className="btn btn-line btn-sm">확인</button>
                        </form>
                      )}
                    </td>
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

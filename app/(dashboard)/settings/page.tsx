import { aliasAddAction, aliasDeleteAction, aliasToggleAction, collectAction, kiprisTestAction, settingsSaveAction } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader, Panel } from "@/components/ui";
import { getDb } from "@/lib/db";
import { applicantAliases } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/queries";
import { claudeModel } from "@/lib/ai/llm";

export const maxDuration = 300;

export default async function SettingsPage() {
  const db = await getDb();
  const [aliases, s] = await Promise.all([db.select().from(applicantAliases).orderBy(applicantAliases.id), getSettings(db)]);
  const maxHit = Math.max(1, ...aliases.map((a) => a.lastHitCount ?? 0));
  const ipcText = s.ipc_supplementary.map((i) => `${i.code} | ${i.meaning} | ${i.tentative ? "잠정" : "확정"}`).join("\n");
  const env = {
    kipris: !!process.env.KIPRIS_PLUS_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    cron: !!process.env.CRON_SECRET,
    slack: !!process.env.NOTIFY_SLACK_WEBHOOK,
    db: !!process.env.DATABASE_URL,
  };

  return (
    <div className="space-y-5">
      <PageHeader crumbs={["설정"]} title="설정" desc="검색 기준(출원인 별칭·보조 IPC)과 위험도 임계값을 코드 밖에서 관리합니다" />

      <div className="notice notice-warn">
        🔒 이 시스템은 <b>공개 특허 정보만</b> 다룹니다. 자사 설계 자료는 회사 승인 환경에서만 다루며, 이 앱에 업로드하지 않습니다.
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        <Panel title="출원인 별칭" right={<span className="text-[12px] text-ink-3">별칭별 건수 차이 = 검색식 설계의 중요성</span>} bodyClass="">
          <div className="grid-wrap">
            <table className="dgrid">
              <thead><tr><th>사용</th><th className="min-w-[220px]">출원인 표기</th><th className="min-w-[200px]">마지막 검색 건수</th><th>비고</th><th>관리</th></tr></thead>
              <tbody>
                {aliases.map((a) => (
                  <tr key={a.id} className={a.active ? "" : "text-ink-3"}>
                    <td className="c">
                      <form action={aliasToggleAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <input type="hidden" name="active" value={a.active ? "0" : "1"} />
                        <button className={`badge ${a.active ? "b-api" : "b-gray"}`} title="클릭해 전환">{a.active ? "사용" : "중지"}</button>
                      </form>
                    </td>
                    <td className="font-medium">{a.name}</td>
                    <td>
                      {a.lastHitCount === null ? (
                        <span className="text-[12px] text-ink-3">미검색</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="h-2.5 flex-1 rounded-[2px] bg-[#eef2f7]">
                            <div className="h-full rounded-[2px] bg-blue" style={{ width: `${(a.lastHitCount / maxHit) * 100}%` }} />
                          </div>
                          <b className="w-12 text-right tabular-nums">{a.lastHitCount}</b>
                        </div>
                      )}
                    </td>
                    <td className="c text-[12px]">{a.note ?? ""}</td>
                    <td className="c">
                      <form action={aliasDeleteAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <button className="btn btn-line btn-sm">삭제</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-body space-y-3 border-t border-line">
            <ActionForm action={aliasAddAction} label="별칭 추가" className="btn btn-dark">
              <input name="name" className="input w-64" placeholder="예: 가즈트랑스포르 에 떼끄니가즈 에스아" required />
              <input name="note" className="input w-40" placeholder="비고 (선택)" />
            </ActionForm>
            <div className="flex flex-wrap items-start gap-3">
              <ActionForm action={collectAction} label="별칭 건수만 확인 (시험 수집)" pendingLabel="검색 중…" className="btn btn-line">
                <input type="hidden" name="dryRun" value="1" />
              </ActionForm>
            </div>
            <p className="text-[12px] text-ink-3">시험 수집은 DB에 반영하지 않고 별칭별 검색 건수만 갱신합니다. 0건이면 표기 변형을 먼저 의심하세요.</p>
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel title="KIPRIS 연결 테스트">
            <p className="mb-3 text-[13px] text-ink-2">서지상세 1건(10-2017-7026964)을 조회해 키·파라미터·응답 구조를 점검합니다.</p>
            <ActionForm action={kiprisTestAction} label="연결 테스트" pendingLabel="조회 중…" />
          </Panel>

          <Panel title="환경 상태">
            <ul className="space-y-1.5 text-[13px]">
              <EnvRow ok={env.kipris} label="KIPRIS_PLUS_API_KEY" />
              <EnvRow ok={env.anthropic} label="ANTHROPIC_API_KEY" hint="AI 분류·청구항 분해에 필요" />
              <EnvRow ok={env.db} label="DATABASE_URL (Neon)" hint="미설정 시 로컬 데모 DB" />
              <EnvRow ok={env.cron} label="CRON_SECRET" />
              <EnvRow ok={env.slack} label="NOTIFY_SLACK_WEBHOOK" hint="선택" />
              <li className="pt-1 text-ink-3">분석 모델: {claudeModel()}</li>
            </ul>
          </Panel>
        </div>
      </div>

      <Panel title="수집·위험도 기준">
        <ActionForm action={settingsSaveAction} label="저장 후 위험도 재계산" className="btn btn-dark" layout="stack">
          <div className="grid gap-4 md:grid-cols-4">
            <NumField name="high_max_elements" label="위험도 상 — 최대 구성요소 수" value={s.high_max_elements} hint="등록 + L1·L2이고 독립항 요소 수가 이 값 이하면 '상'" />
            <NumField name="rows" label="페이지당 건수 (ROWS)" value={s.rows} hint="KIPRIS numOfRows" />
            <NumField name="max_pages" label="별칭당 최대 페이지 (MAX_PAGES)" value={s.max_pages} hint="월 호출 한도 관리" />
            <NumField name="auto_analyze_limit" label="회차당 자동 청구항 분해" value={s.auto_analyze_limit} hint="신규 + 위험도 상 건" />
          </div>
          <label className="mt-2 text-[13px] font-semibold text-ink-2" htmlFor="ipc">보조 IPC <span className="font-normal text-ink-3">(한 줄에 하나: 코드 | 의미 | 잠정/확정 — 시연 중 확정 전까지 잠정)</span></label>
          <textarea id="ipc" name="ipc" rows={4} defaultValue={ipcText} className="textarea w-full font-mono text-[12.5px]" />
          <div className="flex flex-wrap gap-1.5">
            {s.ipc_supplementary.map((i) => (
              <span key={i.code} className={`badge ${i.tentative ? "b-gray b-provisional" : "b-api"}`}>{i.code} · {i.meaning}{i.tentative ? " (잠정)" : ""}</span>
            ))}
          </div>
        </ActionForm>
      </Panel>
    </div>
  );
}

function NumField({ name, label, value, hint }: { name: string; label: string; value: number; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={name} className="text-[13px] font-semibold text-ink-2">{label}</label>
      <input id={name} name={name} type="number" defaultValue={value} className="input" />
      <span className="text-[12px] text-ink-3">{hint}</span>
    </div>
  );
}

function EnvRow({ ok, label, hint }: { ok: boolean; label: string; hint?: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`badge ${ok ? "b-low" : "b-gray"}`}>{ok ? "설정됨" : "없음"}</span>
      <code className="text-[12.5px]">{label}</code>
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </li>
  );
}

import Link from "next/link";
import { ClassChip, Empty, PageHeader, PatentLink, RiskBadge, StatusBadge, VerifiedBadge } from "@/components/ui";
import { getDb } from "@/lib/db";
import { listPatents, parseFilter } from "@/lib/db/queries";
import { FAMILIES, LAYERS, FAMILY_INFO, LAYER_INFO } from "@/lib/domain/taxonomy";

const PAGE_SIZE = 50;

export default async function PatentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const f = parseFilter(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const { total, rows } = await listPatents(await getDb(), f, page, PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const qs = (extra: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...extra })) if (v !== undefined && v !== "") p.set(k, String(v));
    return p.toString();
  };
  const csvQs = qs({});
  const year = new Date().getFullYear();
  const yearOpts = Array.from({ length: 30 }, (_, i) => year - i);

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={["특허 목록"]}
        title="특허 목록"
        desc="필터로 좁혀 보기 — 예: 상태군 '유효' + 계열 'MK3' + 층위 'L2'"
        actions={<a className="btn btn-line" href={`/api/export/patents.csv${csvQs ? `?${csvQs}` : ""}`}>⤓ CSV 다운로드</a>}
      />

      {/* 조회조건 */}
      <form className="search-box" method="get">
        <div className="grid gap-x-5 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="field">
            <label htmlFor="group">상태군</label>
            <select id="group" name="group" defaultValue={f.group ?? ""} className="select flex-1">
              <option value="">전체</option>
              <option value="valid">유효 (등록)</option>
              <option value="pending">잠재 (공개·심사중)</option>
              <option value="inactive">비유효</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="family">계열</label>
            <select id="family" name="family" defaultValue={f.family ?? ""} className="select flex-1">
              <option value="">전체</option>
              {FAMILIES.map((x) => <option key={x} value={x}>{x} · {FAMILY_INFO[x].label}</option>)}
              <option value="UNCLASSIFIED">미분류</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="layer">층위</label>
            <select id="layer" name="layer" defaultValue={f.layer ?? ""} className="select flex-1">
              <option value="">전체</option>
              {LAYERS.map((x) => <option key={x} value={x}>{x} · {LAYER_INFO[x].label}</option>)}
              <option value="UNCLASSIFIED">미분류</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="risk">위험도</label>
            <select id="risk" name="risk" defaultValue={f.risk ?? ""} className="select flex-1">
              <option value="">전체</option>
              <option value="HIGH">🔴 상</option>
              <option value="MID">🟡 중</option>
              <option value="LOW">🟢 하</option>
              <option value="NONE">분류 필요</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="verified">검증</label>
            <select id="verified" name="verified" defaultValue={f.verified ?? ""} className="select flex-1">
              <option value="">전체</option>
              <option value="API">API</option>
              <option value="WEB">웹확인</option>
              <option value="UNVERIFIED">미검증</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="yearFrom">출원연도</label>
            <select id="yearFrom" name="yearFrom" defaultValue={f.yearFrom ?? ""} className="select min-w-0 flex-1">
              <option value="">시작</option>
              {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-ink-3">~</span>
            <select name="yearTo" aria-label="출원연도 끝" defaultValue={f.yearTo ?? ""} className="select min-w-0 flex-1">
              <option value="">끝</option>
              {yearOpts.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sort">정렬</label>
            <select id="sort" name="sort" defaultValue={f.sort ?? ""} className="select flex-1">
              <option value="">출원일 최신순</option>
              <option value="app_date_asc">출원일 오래된순</option>
              <option value="risk">위험도순</option>
              <option value="reg_date_desc">등록일 최신순</option>
              <option value="title">명칭순</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="q">검색</label>
            <input id="q" name="q" defaultValue={f.q ?? ""} placeholder="발명의 명칭 또는 출원번호" className="input min-w-0 flex-1" />
          </div>
        </div>
        <div className="mt-3 flex justify-center gap-2 border-t border-line pt-3">
          <button className="btn btn-dark min-w-24">조회</button>
          <Link className="btn btn-line min-w-24" href="/patents">초기화</Link>
        </div>
      </form>

      <div className="flex items-end justify-between">
        <div className="text-[13px] text-ink-2">
          총 <b className="text-blue">{total.toLocaleString()}</b>건 · {page}/{pages} 페이지
        </div>
        <div className="flex items-center gap-3 text-[12px] text-ink-3">
          <span className="badge b-high b-provisional">점선 = 잠정 등급</span>
          <span className="badge b-gray">회색 = API 미검증</span>
        </div>
      </div>

      <div className="grid-wrap border border-line">
        <table className="dgrid">
          <thead>
            <tr>
              <th>No</th><th>출원번호</th><th>출원일</th><th className="min-w-[280px]">발명의 명칭</th><th>법적상태</th>
              <th>등록번호</th><th>계열 · 층위</th><th>위험도</th><th>검증</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={p.appNo} className={p.verified !== "API" ? "bg-[#fafafa] text-ink-2" : ""}>
                <td className="c text-ink-3">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="c"><PatentLink appNo={p.appNo} /></td>
                <td className="c whitespace-nowrap">{p.appDate ?? "-"}</td>
                <td>
                  <Link href={`/patents/${encodeURIComponent(p.appNo)}`} className="hover:text-blue hover:underline">{p.title}</Link>
                  {p.ipc?.length ? <div className="mt-0.5 text-[11.5px] text-ink-3">{p.ipc.slice(0, 3).join(" · ")}</div> : null}
                </td>
                <td className="c"><StatusBadge status={p.status} group={p.statusGroup} /></td>
                <td className="c whitespace-nowrap text-[12px]">{p.regNo ?? "-"}</td>
                <td className="c"><ClassChip family={p.family} layer={p.layer} /></td>
                <td className="c"><RiskBadge risk={p.risk} provisional={p.riskProvisional} /></td>
                <td className="c"><VerifiedBadge v={p.verified} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>조건에 맞는 특허가 없습니다.</Empty>}
      </div>

      {pages > 1 && (
        <nav className="flex flex-wrap justify-center gap-1" aria-label="페이지">
          {page > 1 && <Link className="btn btn-line btn-sm" href={`/patents?${qs({ page: page - 1 })}`}>‹ 이전</Link>}
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === pages || Math.abs(n - page) <= 2)
            .map((n, i, arr) => (
              <span key={n} className="flex items-center gap-1">
                {i > 0 && n - arr[i - 1] > 1 && <span className="px-1 text-ink-3">…</span>}
                <Link className={`btn btn-sm ${n === page ? "btn-dark" : "btn-line"}`} href={`/patents?${qs({ page: n })}`}>{n}</Link>
              </span>
            ))}
          {page < pages && <Link className="btn btn-line btn-sm" href={`/patents?${qs({ page: page + 1 })}`}>다음 ›</Link>}
        </nav>
      )}
    </div>
  );
}

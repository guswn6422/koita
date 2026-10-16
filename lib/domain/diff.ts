/** 모니터링 비교 (Skill 5장) — 기준(DB)과 이번 수집 결과를 app_no로 비교하는 순수 함수 */

export type Snapshot = { appNo: string; status: string | null; regNo: string | null };

export type DiffEvent =
  | { type: "NEW"; appNo: string; before: null; after: string | null }
  | { type: "STATUS_CHANGED"; appNo: string; before: string | null; after: string | null }
  | { type: "REG_NO_ASSIGNED"; appNo: string; before: string | null; after: string };

const norm = (v: string | null | undefined) => (v ?? "").trim() || null;

export function diffSnapshots(baseline: Snapshot[], current: Snapshot[]): DiffEvent[] {
  const base = new Map(baseline.map((b) => [b.appNo, b]));
  const events: DiffEvent[] = [];
  const seen = new Set<string>();
  for (const cur of current) {
    if (seen.has(cur.appNo)) continue; // 같은 출원번호가 여러 별칭에서 나오면 1건
    seen.add(cur.appNo);
    const old = base.get(cur.appNo);
    if (!old) {
      events.push({ type: "NEW", appNo: cur.appNo, before: null, after: norm(cur.status) });
      continue;
    }
    if (norm(old.status) !== norm(cur.status)) {
      events.push({ type: "STATUS_CHANGED", appNo: cur.appNo, before: norm(old.status), after: norm(cur.status) });
    }
    const newReg = norm(cur.regNo);
    if (!norm(old.regNo) && newReg) {
      events.push({ type: "REG_NO_ASSIGNED", appNo: cur.appNo, before: null, after: newReg });
    }
  }
  return events;
}

export const EVENT_LABEL: Record<DiffEvent["type"], string> = {
  NEW: "신규",
  STATUS_CHANGED: "상태변경",
  REG_NO_ASSIGNED: "등록번호 부여",
};

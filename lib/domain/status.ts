/** 법적상태 → 유효/잠재/비유효 매핑 (Skill Step 3) */
export type StatusGroup = "valid" | "pending" | "inactive";

const MAP: Record<string, StatusGroup> = {
  등록: "valid",
  공개: "pending",
  심사중: "pending",
  소멸: "inactive",
  거절: "inactive",
  취하: "inactive",
  포기: "inactive",
};

export const STATUS_GROUP_LABEL: Record<StatusGroup, string> = {
  valid: "유효 권리",
  pending: "잠재 권리",
  inactive: "비유효",
};

/**
 * KIPRIS registerStatus 원문 → status_group.
 * 매핑에 없거나 빈 값이면 pending + 경고 로그(매핑 표 보정 대상).
 */
export function toStatusGroup(status: string | null | undefined, warn = console.warn): StatusGroup {
  const s = (status ?? "").trim();
  if (MAP[s]) return MAP[s];
  // "등록결정", "거절결정" 같은 변형은 접두어로 판정
  for (const [k, v] of Object.entries(MAP)) if (s.startsWith(k)) return v;
  warn(`[status] 매핑되지 않은 법적상태: "${s}" → pending 처리 (lib/domain/status.ts 보정 필요)`);
  return "pending";
}

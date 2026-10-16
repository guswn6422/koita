// 차트 팔레트 — dataviz validate_palette.js 통과 (유효 / 잠재 / 비유효).
// 대비 WARN(밝은 두 색) → 범례·수치 라벨을 항상 함께 표시한다.
export const GROUP_COLORS = { valid: "#1a56a4", pending: "#2fa4d8", inactive: "#d98a2b" } as const;
export const GROUP_LABELS = { valid: "유효(등록)", pending: "잠재(공개·심사중)", inactive: "비유효" } as const;

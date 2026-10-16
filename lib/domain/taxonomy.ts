/** 분류 체계 — Skill 3장 */

export const FAMILIES = ["NO96", "MK3", "FLEX", "SLIM", "GST", "ETC"] as const;
export const LAYERS = ["L1", "L2", "L3", "L4"] as const;
export type FamilyCode = (typeof FAMILIES)[number] | "UNCLASSIFIED";
export type LayerCode = (typeof LAYERS)[number] | "UNCLASSIFIED";

export const FAMILY_INFO: Record<FamilyCode, { label: string; short: string; cues: string }> = {
  NO96: { label: "NO96 / GT 계열", short: "NO96/GT", cues: "인바(Invar), 니켈 36%, 평판 멤브레인, 박스형 단열(합판 상자)" },
  MK3: { label: "Mark III / TGZ 계열", short: "Mark III", cues: "주름(corrugated) 스테인리스 멤브레인, 폴리우레탄 폼(RPUF), 단열 패널" },
  FLEX: { label: "Mark III Flex / NO96 Evolution 등 개량형", short: "개량형", cues: "증발률(BOR) 저감, 단열 두께·밀도 최적화" },
  SLIM: { label: "Slim 등 다른 액화가스 확장", short: "Slim 확장", cues: "에탄·암모니아·LPG·수소" },
  GST: { label: "육상·부유 저장", short: "육상·부유", cues: "육상 탱크, FSRU, 저장설비" },
  ETC: { label: "공통·기타", short: "공통·기타", cues: "위 계열로 특정 불가한 공통 기술" },
  UNCLASSIFIED: { label: "미분류", short: "미분류", cues: "근거가 약해 분류 보류" },
};

export const LAYER_INFO: Record<LayerCode, { label: string; examples: string }> = {
  L1: { label: "원천 구조", examples: "멤브레인+단열층+2차 방벽의 기본 아키텍처" },
  L2: { label: "단열 블록·지지 구조", examples: "단열 블록, 앵커링, 이음부, 코너 구조, 브리징 요소" },
  L3: { label: "누출·열 관리", examples: "누출 감지, 대류 억제, 가스 순환, 모니터링" },
  L4: { label: "시공·제조 공정", examples: "패널 제조 방법, 조립·용접 방법, 시공 장비" },
  UNCLASSIFIED: { label: "미분류", examples: "" },
};

/** 신뢰도가 이 값 미만이면 UNCLASSIFIED로 저장 */
export const MIN_CONFIDENCE = 0.6;

export function familyLabel(code: string | null | undefined) {
  return FAMILY_INFO[(code ?? "UNCLASSIFIED") as FamilyCode]?.label ?? code ?? "-";
}
export function layerLabel(code: string | null | undefined) {
  return LAYER_INFO[(code ?? "UNCLASSIFIED") as LayerCode]?.label ?? code ?? "-";
}

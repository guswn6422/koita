import { describe, expect, it } from "vitest";
import { computeRisk } from "../lib/domain/risk";
import { diffSnapshots } from "../lib/domain/diff";
import { toStatusGroup } from "../lib/domain/status";
import { findBannedTerms, DISCLAIMER } from "../lib/report/compliance";
import { monitorReport } from "../lib/report/markdown";

describe("computeRisk — 상태군 × 층위 × 요소 수", () => {
  const cases: [Parameters<typeof computeRisk>[0], string, boolean][] = [
    [{ statusGroup: "valid", layer: "L1" }, "HIGH", true],
    [{ statusGroup: "valid", layer: "L2", elementCount: 3 }, "HIGH", false],
    [{ statusGroup: "valid", layer: "L2", elementCount: 4 }, "HIGH", false],
    [{ statusGroup: "valid", layer: "L2", elementCount: 5 }, "MID", false],
    [{ statusGroup: "valid", layer: "L3" }, "MID", false],
    [{ statusGroup: "valid", layer: "L4", elementCount: 2 }, "MID", false],
    [{ statusGroup: "pending", layer: "L1" }, "MID", false],
    [{ statusGroup: "pending", layer: "L2", elementCount: 2 }, "MID", false],
    [{ statusGroup: "pending", layer: "L3" }, "LOW", false],
    [{ statusGroup: "pending", layer: "L4" }, "LOW", false],
    [{ statusGroup: "inactive", layer: "L1", elementCount: 1 }, "LOW", false],
    [{ statusGroup: "inactive", layer: "L3" }, "LOW", false],
  ];
  it.each(cases)("%j → %s (잠정 %s)", (input, risk, provisional) => {
    expect(computeRisk(input)).toEqual({ risk, provisional });
  });
  it("임계값을 바꾸면 결과가 따라 바뀐다", () => {
    expect(computeRisk({ statusGroup: "valid", layer: "L1", elementCount: 6 }, 6).risk).toBe("HIGH");
  });
});

describe("toStatusGroup", () => {
  it("KIPRIS 상태를 유효/잠재/비유효로 매핑한다", () => {
    expect(toStatusGroup("등록")).toBe("valid");
    expect(toStatusGroup("공개")).toBe("pending");
    expect(toStatusGroup("소멸")).toBe("inactive");
    expect(toStatusGroup("거절결정")).toBe("inactive");
  });
  it("모르는 값은 pending + 경고", () => {
    const warns: string[] = [];
    expect(toStatusGroup("", (m) => warns.push(m))).toBe("pending");
    expect(warns).toHaveLength(1);
  });
});

describe("diffSnapshots — 기준에서 1건 삭제·상태 변경 후 이벤트 3종 감지", () => {
  const baseline = [
    { appNo: "A", status: "공개", regNo: null },
    { appNo: "B", status: "등록", regNo: "1001" },
    { appNo: "C", status: "등록", regNo: "1002" },
  ];
  it("신규 / 상태변경 / 등록번호 부여", () => {
    const current = [
      { appNo: "A", status: "등록", regNo: "1003" }, // 공개→등록 + 등록번호 신규
      { appNo: "B", status: "등록", regNo: "1001" }, // 변화 없음
      { appNo: "C", status: "소멸", regNo: "1002" }, // 등록→소멸
      { appNo: "D", status: "공개", regNo: null }, // 신규 (기준에서 삭제된 건)
      { appNo: "D", status: "공개", regNo: null }, // 다른 별칭에서 중복
    ];
    const ev = diffSnapshots(baseline, current);
    expect(ev).toEqual([
      { type: "STATUS_CHANGED", appNo: "A", before: "공개", after: "등록" },
      { type: "REG_NO_ASSIGNED", appNo: "A", before: null, after: "1003" },
      { type: "STATUS_CHANGED", appNo: "C", before: "등록", after: "소멸" },
      { type: "NEW", appNo: "D", before: null, after: "공개" },
    ]);
  });
  it("변화가 없으면 빈 배열", () => {
    expect(diffSnapshots(baseline, baseline)).toEqual([]);
  });
});

describe("보고서·법적 표현", () => {
  it("변경이 없으면 '신규·변경 없음' 한 줄과 고지 문구", () => {
    const md = monitorReport({ startedAt: new Date("2026-10-18T22:10:00Z"), previousCheck: null, aliases: ["X"], events: [], state: "DONE", apiCalls: 4 });
    expect(md).toContain("신규·변경 없음");
    expect(md).toContain(DISCLAIMER);
    expect(md).toContain("2026-10-19"); // KST 날짜
    expect(findBannedTerms(md)).toEqual([]);
  });
  it("금지어를 찾는다 (고지 문구 자체는 제외)", () => {
    expect(findBannedTerms(`${DISCLAIMER}\n이 구성은 침해하지 않는다`)).toEqual(["침해하지 않는다"]);
  });
});

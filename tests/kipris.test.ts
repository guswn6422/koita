import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkResult, KiprisError, maskKey } from "../lib/kipris/client";
import { parseSearchDoc } from "../lib/kipris/search";
import { parseDetailDoc, splitIndependentClaims } from "../lib/kipris/detail";
import { dedupe, normalizeAppNo, normalizeDate, regNoKey, splitMulti } from "../lib/kipris/normalize";

const fx = (n: string) => readFileSync(`tests/fixtures/kipris/${n}`, "utf-8");

describe("normalize", () => {
  it("출원번호·날짜·다중값을 정규화한다", () => {
    expect(normalizeAppNo("10-2022-0178326")).toBe("1020220178326");
    expect(normalizeDate("2022.12.19")).toBe("2022-12-19");
    expect(normalizeDate("20221219")).toBe("2022-12-19");
    expect(normalizeDate("")).toBeNull();
    expect(splitMulti("F17C 3/02|B63B 25/16| F17C 3/02")).toEqual(["F17C 3/02", "B63B 25/16"]);
  });
  it("웹 시드 등록번호와 KIPRIS 등록번호를 같은 키로 맞춘다", () => {
    expect(regNoKey("KR102202778B1")).toBe("102202778");
    expect(regNoKey("1022027780000")).toBe("102202778");
  });
});

describe("검색 응답 (실제 응답 픽스처)", () => {
  const { records, total, itemCount } = parseSearchDoc(checkResult(fx("search_live.xml")));
  it("item을 레코드로 변환하고 전체 건수를 읽는다", () => {
    expect(itemCount).toBe(5);
    expect(records).toHaveLength(5);
    expect(total).toBeGreaterThan(100);
    expect(records[0].appNo).toMatch(/^\d{13}$/);
    expect(records.every((r) => r.applicant?.includes("떼끄니가즈"))).toBe(true);
  });
  it("출원인 표기 4종에서 같은 출원번호가 나와도 1건으로 합친다", () => {
    const variants = ["가즈트랑스포르 에 떼끄니가즈", "가즈트랑스포르에떼끄니가즈", "GAZTRANSPORT ET TECHNIGAZ", "GAZTRANSPORT & TECHNIGAZ"];
    const merged = variants.flatMap((v) => records.map((r) => ({ ...r, applicant: v })));
    expect(merged).toHaveLength(20);
    expect(dedupe(merged)).toHaveLength(5);
  });
});

describe("서지상세 응답 (실제 응답 픽스처)", () => {
  const d = parseDetailDoc(checkResult(fx("detail_live.xml")))!;
  it("출원인은 applicantInfo에서만, 청구항은 claimInfo에서 읽는다", () => {
    expect(d.appNo).toBe("1020177026964");
    expect(d.applicant).toContain("떼끄니가즈");
    expect(d.claims.length).toBe(19);
  });
  it("종속항(제 n 항에 있어서)을 걸러 독립항만 남긴다", () => {
    const { independent } = splitIndependentClaims(d.claims);
    expect(independent.length).toBeGreaterThanOrEqual(1);
    expect(independent[0].no).toBe(1);
    expect(independent.every((c) => !/제\s*\d+\s*항에 있어서/.test(c.text))).toBe(true);
  });
});

describe("오류 처리", () => {
  it("resultCode가 정상이 아니면 원문 코드·메시지로 KiprisError를 던진다", () => {
    expect(() => checkResult(fx("auth_error.xml"))).toThrow(KiprisError);
    try {
      checkResult(fx("auth_error.xml"));
    } catch (e) {
      expect((e as KiprisError).code).toBe("30");
      expect((e as KiprisError).message).toContain("SERVICE KEY IS NOT REGISTERED");
    }
  });
  it("ServiceKey 값을 가린다", () => {
    expect(maskKey("https://x/y?a=1&ServiceKey=abc%2Fdef&b=2")).toBe("https://x/y?a=1&ServiceKey=***&b=2");
  });
});

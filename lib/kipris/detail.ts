import { kiprisCall, type CallMeter } from "./client";
import {
  findAll, firstText, normalizeAppNo, normalizeDate, splitMulti, textOf, type NormalizedPatent,
} from "./normalize";

type XmlNode = Record<string, unknown>;

export type PatentDetail = NormalizedPatent & { claims: string[] };

/**
 * 서지상세 응답 해석. 상세 응답은 body/item 아래 *InfoArray 묶음 구조다.
 * - 출원인은 applicantInfo/name 아래에서만 읽는다 (inventorInfo/name·agentInfo/name과 구분)
 * - 청구항은 claimInfo/claim
 */
export function parseDetailDoc(doc: XmlNode): PatentDetail | null {
  const childTexts = (parent: string, child: string) =>
    findAll(doc, parent).flatMap((p) => (p && typeof p === "object" ? findAll(p, child) : [])).map(textOf)
      .filter((v): v is string => !!v);

  const appNo = normalizeAppNo(firstText(doc, "applicationNumber"));
  if (!appNo) return null;
  const applicants = childTexts("applicantInfo", "name");
  const ipc = childTexts("ipcInfo", "ipcNumber");
  const claims = childTexts("claimInfo", "claim");

  return {
    appNo,
    appDate: normalizeDate(firstText(doc, "applicationDate")),
    title: firstText(doc, "inventionTitle") ?? firstText(doc, "inventionName") ?? "(명칭 없음)",
    applicant: applicants.length ? applicants.join(" | ") : firstText(doc, "applicantName"),
    ipc: ipc.length ? ipc : splitMulti(firstText(doc, "ipcNumber")),
    pubNo: firstText(doc, "openNumber"),
    pubDate: normalizeDate(firstText(doc, "openDate")),
    regNo: firstText(doc, "registerNumber"),
    regDate: normalizeDate(firstText(doc, "registerDate")),
    status: firstText(doc, "registerStatus"),
    abstract: firstText(doc, "astrtCont") ?? firstText(doc, "abstract"),
    claims,
    raw: doc,
  };
}

/** 서지상세·청구항 조회 (getBibliographyDetailInfoSearch) */
export async function getDetail(appNo: string, meter?: CallMeter) {
  const { doc } = await kiprisCall("getBibliographyDetailInfoSearch", { applicationNumber: appNo }, meter);
  return parseDetailDoc(doc);
}

/**
 * 청구항 목록에서 독립항을 고른다. 다른 항을 인용하는("제n항에 있어서", "청구항 n에") 항은 종속항.
 * 청구항 문자열 앞의 번호를 읽지 못하면 순서(1부터)를 번호로 쓴다.
 */
export function splitIndependentClaims(claims: string[]) {
  const parsed = claims.map((text, i) => {
    const m = text.match(/^\s*(?:【?\s*청구항\s*)?(\d+)\s*[】.\]]/);
    return { no: m ? Number(m[1]) : i + 1, text: text.trim() };
  });
  // 앞부분에서 다른 항을 인용하면 종속항 ("제 1 항에 있어서", "제1항 내지 제3항 중 어느 한 항에 따른", "청구항 2에")
  const cites = /(제\s*\d+\s*항|청구항\s*\d+)/;
  const independent = parsed.filter((c) => {
    const body = c.text.replace(/^\s*\d+\s*[.\]】]\s*/, "");
    return !cites.test(body.slice(0, 150)) && !/^\s*삭제/.test(body);
  });
  return { all: parsed, independent };
}

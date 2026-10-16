import { XMLParser } from "fast-xml-parser";

/** KIPRIS 응답 태그 → 스키마 필드 (기술명세서 6-1) */
export const FIELD_MAP = {
  applicationNumber: "appNo", applicationDate: "appDate",
  inventionTitle: "title", applicantName: "applicant",
  ipcNumber: "ipc", openNumber: "pubNo", openDate: "pubDate",
  registerNumber: "regNo", registerDate: "regDate",
  registerStatus: "status", astrtCont: "abstract",
} as const;

export type NormalizedPatent = {
  appNo: string;
  appDate: string | null;
  title: string;
  applicant: string | null;
  ipc: string[];
  pubNo: string | null;
  pubDate: string | null;
  regNo: string | null;
  regDate: string | null;
  status: string | null;
  abstract: string | null;
  raw: Record<string, unknown>;
};

type XmlNode = Record<string, unknown>;

// 값은 모두 문자열로 받는다 (출원번호가 숫자로 바뀌면 앞자리 정밀도가 깨진다)
const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

export function parseXml(xml: string): XmlNode {
  return parser.parse(xml) as XmlNode;
}

/** 트리 전체에서 tag 이름이 같은 노드를 모두 찾는다 */
export function findAll(node: unknown, tag: string, out: unknown[] = []): unknown[] {
  if (Array.isArray(node)) {
    for (const n of node) findAll(n, tag, out);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as XmlNode)) {
      if (k === tag) {
        if (Array.isArray(v)) out.push(...v);
        else out.push(v);
      }
      findAll(v, tag, out);
    }
  }
  return out;
}

export function textOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" || typeof v === "number") {
    const s = String(v).trim();
    return s ? s : null;
  }
  if (typeof v === "object" && "#text" in (v as XmlNode)) return textOf((v as XmlNode)["#text"]);
  return null;
}

export function firstText(node: unknown, tag: string): string | null {
  for (const v of findAll(node, tag)) {
    const t = textOf(v);
    if (t) return t;
  }
  return null;
}

/** 출원번호 정규화: "10-2022-0178326" / "1020220178326" → "1020220178326" */
export function normalizeAppNo(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d : null;
}

/** 날짜 정규화: "20221219" / "2022.12.19" → "2022-12-19" */
export function normalizeDate(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/** 다중 값은 `|`로만 나눈다 (쉼표는 회사명을 쪼갠다) */
export function splitMulti(v: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of (v ?? "").split("|")) {
    const s = part.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

const blank = (v: string | null) => (v && v.trim() ? v.trim() : null);

/** 검색 응답 item(평평한 태그) → NormalizedPatent */
export function normalizeItem(item: XmlNode): NormalizedPatent | null {
  const get = (tag: string) => textOf(item[tag]);
  const appNo = normalizeAppNo(get("applicationNumber"));
  if (!appNo) return null;
  return {
    appNo,
    appDate: normalizeDate(get("applicationDate")),
    title: get("inventionTitle") ?? "(명칭 없음)",
    applicant: blank(splitMulti(get("applicantName")).join(" | ")),
    ipc: splitMulti(get("ipcNumber")),
    pubNo: blank(get("openNumber")),
    pubDate: normalizeDate(get("openDate")),
    regNo: blank(get("registerNumber")),
    regDate: normalizeDate(get("registerDate")),
    status: blank(get("registerStatus")),
    abstract: blank(get("astrtCont")),
    raw: item,
  };
}

/** 출원번호 기준 중복 제거 (먼저 나온 레코드 유지) */
export function dedupe(records: NormalizedPatent[]): NormalizedPatent[] {
  const map = new Map<string, NormalizedPatent>();
  for (const r of records) if (!map.has(r.appNo)) map.set(r.appNo, r);
  return [...map.values()];
}

/** 등록번호 비교용 키: "KR102202778B1" → "102202778", "1022027780000" → "102202778" */
export function regNoKey(v: string | null | undefined): string | null {
  const d = (v ?? "").toUpperCase().replace(/^KR/, "").replace(/[A-Z]\d?$/, "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 13 && d.endsWith("0000") ? d.slice(0, 9) : d;
}

import { kiprisCall, type CallMeter } from "./client";
import { findAll, firstText, normalizeItem, type NormalizedPatent } from "./normalize";

type XmlNode = Record<string, unknown>;

/** 검색 응답 XML 문서 → 레코드 + 전체 건수 */
export function parseSearchDoc(doc: XmlNode) {
  const items = findAll(doc, "item").filter((i): i is XmlNode => !!i && typeof i === "object");
  const records = items.map(normalizeItem).filter((r): r is NormalizedPatent => r !== null);
  const totalRaw = firstText(doc, "totalCount") ?? firstText(doc, "TotalSearchCount");
  const total = totalRaw ? Number.parseInt(totalRaw, 10) || 0 : records.length;
  return { records, total, itemCount: items.length };
}

/** 출원인 변형 1개, 1페이지 조회 (getAdvancedSearch) */
export async function searchApplicantPage(name: string, page: number, rows: number, meter?: CallMeter) {
  const { doc } = await kiprisCall(
    "getAdvancedSearch",
    { applicant: name, patent: "true", utility: "true", numOfRows: rows, pageNo: page },
    meter,
  );
  return parseSearchDoc(doc);
}

export type CollectCursor = { aliasIndex: number; page: number };

export type CollectProgress = {
  records: NormalizedPatent[];
  hitsByAlias: Record<string, number>;
  /** 시간 제한으로 중단했다면 다음 재개 지점 */
  cursor: CollectCursor | null;
};

/**
 * 출원인 변형별 전체 페이지 수집. deadline(ms epoch)에 가까워지면 cursor를 남기고 멈춘다.
 * 같은 출원번호의 중복 제거는 호출 측(sync)에서 한다.
 */
export async function collectByAliases(opts: {
  aliases: string[];
  rows: number;
  maxPages: number;
  start?: CollectCursor | null;
  deadline?: number;
  meter?: CallMeter;
}): Promise<CollectProgress> {
  const { aliases, rows, maxPages, meter } = opts;
  const records: NormalizedPatent[] = [];
  const hitsByAlias: Record<string, number> = {};
  let ai = opts.start?.aliasIndex ?? 0;
  let page = opts.start?.page ?? 1;

  for (; ai < aliases.length; ai++, page = 1) {
    const name = aliases[ai];
    for (; page <= maxPages; page++) {
      if (opts.deadline && Date.now() > opts.deadline) {
        return { records, hitsByAlias, cursor: { aliasIndex: ai, page } };
      }
      const { records: recs, total, itemCount } = await searchApplicantPage(name, page, rows, meter);
      hitsByAlias[name] = total;
      records.push(...recs);
      if (itemCount === 0 || page * rows >= total) break;
    }
  }
  return { records, hitsByAlias, cursor: null };
}

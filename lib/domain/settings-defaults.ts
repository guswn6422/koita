/** settings 테이블 기본값 (Skill 2-2 보조 IPC, Step 6 임계값, 수집 페이지 한도) */
export type IpcEntry = { code: string; meaning: string; tentative: boolean };

export type AppSettings = {
  ipc_supplementary: IpcEntry[];
  high_max_elements: number;
  rows: number;
  max_pages: number;
  auto_analyze_limit: number;
};

export const DEFAULT_SETTINGS: AppSettings = {
  ipc_supplementary: [
    { code: "F17C 3/02", meaning: "단열 구비 비가압 저장용기", tentative: true },
    { code: "F17C 3/04", meaning: "단열층", tentative: true },
    { code: "B63B 25/16", meaning: "선박의 액화가스 적재 설비", tentative: true },
    { code: "F17C 13/00", meaning: "용기 세부(누출 감지·모니터링 등)", tentative: true },
  ],
  high_max_elements: 4,
  rows: 100,
  max_pages: 10,
  auto_analyze_limit: 3,
};

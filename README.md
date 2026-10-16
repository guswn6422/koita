# GTT 한국 특허 분석·모니터링 앱

GTT(가즈트랑스포르 에 떼끄니가즈)의 LNG 화물창 단열시스템 한국 특허를 KIPRIS Plus로 수집하고,
Claude로 계열·층위 분류와 청구항 분해를 한 뒤, 규칙 함수로 위험도를 매기고 주간 신규·상태변경을 감시합니다.

> 본 자료는 공개 특허 정보 기반 1차 기술 검토 자료이며, 침해·회피 판단은 변리사 검토 대상입니다.

기술명세서: `SPEC gtt-patent-app-tech-spec.md` v1.0 (2026-10-16)

## 이번 작업 요약 (2026-10-16)

**구현한 것**
- Next.js 16(App Router) + Drizzle + Neon 기반 앱 골격, 시연용 비밀번호 로그인(`proxy.ts`, HMAC 서명 쿠키)
- KIPRIS 클라이언트: 출원인 별칭별 페이지 수집, 서지상세·청구항 조회, 300ms 간격·지수 백오프 재시도, ServiceKey 마스킹
- 도메인 규칙: 법적상태 → 유효/잠재/비유효, 위험도 규칙 함수, 모니터링 diff(신규/상태변경/등록번호 부여)
- Claude 분석 엔진: 계열·층위 분류(근거 단어·신뢰도, 0.6 미만은 미분류), 독립항 구성요소 분해
- 화면 6종: 대시보드(KPI·분포 차트·연도별 추이), 특허 목록(필터·CSV), 특허 상세(분류 근거·수동 수정·청구항 분해), 모니터링, 회차 보고서(.md), 설정(별칭·IPC·임계값·연결 테스트)
- Vercel Cron(매주 월 07:00 KST), 회차 cursor 재개·PARTIAL 처리, 이력 테이블, Slack 알림(선택)
- 업무시스템 스타일 UI(네이비 GNB·좌측 LNB·조회조건 박스·상단 2px 라인 그리드), 모든 화면 하단 법적 고지

**검증 결과 (로컬, 실제 KIPRIS·Claude API)**
- KIPRIS 수집: 별칭 4종 × 554건 = 조회 2,216건 → 중복 제거 후 고유 554건, 호출 24회
- 부록 B 웹 시드 5건이 같은 등록번호의 API 레코드로 대체되고 분류가 이어짐
- 시연 시나리오: 기준에서 1건 삭제 → 모니터링 실행 → "신규 1건" 감지, 회차 보고서 생성
- AI 분류 30건 완료, 청구항 분해(10-2018-0077195 제1항 → 구성요소 9개) 후 위험도 '상(잠정)' → '중' 확정, 금지 표현 없음
- CSV UTF-8 BOM 확인, `vitest` 27건 통과, `next build`·`tsc`·`eslint` 통과, 모바일(375px) 가로 스크롤 없음

## 작업 중 발견·수정한 오류

| 증상 | 원인 | 수정 |
|---|---|---|
| `npm i -D vitest` 실패 (ERESOLVE) | vitest 5가 `@types/node` 22 이상을 요구 | `@types/node@24`로 올림 |
| 스캐폴드 기본값과 동적 렌더링 충돌 | create-next-app이 `cacheComponents`를 켬 | 끄고 `force-dynamic` 모델 사용 |
| Sonnet 5.5에서 분류 호출 400 예상 | 명세의 강제 `tool_choice`를 모델이 거부 | Structured Outputs(`output_config.format` + Zod)로 대체 |
| 대시보드 첫 진입 시 `Can't find meta/_journal.json` | 개발 서버가 상위 폴더에서 실행돼 `process.cwd()`가 달라짐 | `scripts/dev.cmd`로 프로젝트 폴더에서 실행 |
| PGlite 초기화 실패 (`ENOENT mkdir .data/pglite`) | 데이터 폴더가 없음 | 시작 시 `mkdirSync(..., { recursive: true })` |
| 헤더 로고·단계 번호 상자가 가로로 늘어남 | 표 전용 `.grid` 클래스가 Tailwind `grid` 유틸리티를 덮어씀 | 표 클래스를 `.dgrid`로 변경 |
| 법적상태 막대·범례 색과 라벨이 비어 보임 | `"use client"` 모듈의 상수를 서버 컴포넌트에서 import해 값 대신 참조가 전달됨 | 팔레트를 `lib/ui/palette.ts`로 분리 |
| 계열 차트 라벨이 "MK3 · Mark"처럼 잘림 | 긴 라벨을 첫 단어로 자름 | `FAMILY_INFO.short` 짧은 라벨 추가 |
| 키가 없는데 "AI 분류 0건 · 미분류 0건"으로 표시 | 분류를 건너뛴 경우에도 집계 줄을 표시 | 키가 있을 때만 표시하고 미설정 경고만 남김 |
| 보고서에 `UNCLASSIFIED · UNCLASSIFIED` 원문 노출 | 코드값을 그대로 출력 | "미분류"로 표시, 위험도 없음은 "분류 필요" |
| 조회조건의 계열 선택 상자가 오른쪽으로 넘침 | 긴 옵션 문구로 최소 너비가 커짐 | `.select { min-width: 0 }` |
| "제 1 항에 있어서"처럼 띄어 쓴 종속항이 독립항으로 잡힐 수 있음 | 종속항 판별 정규식이 띄어쓰기 변형에 약함 | 앞 150자 안의 "제 n 항 / 청구항 n" 인용 여부로 판별 |

## 빠른 시작 (로컬)

```bash
npm install
npm run dev
```

- `http://localhost:3000` → `.env.local`의 `APP_PASSWORD`로 로그인
- `DATABASE_URL`이 비어 있으면 **로컬 데모 DB(PGlite, `.data/pglite`)**로 동작하며 마이그레이션·시드(별칭 8개, 부록 B 웹 시드 5건)를 자동 적용합니다.
- 대시보드 → **전체 수집** → **미분류 일괄 분류** → **모니터링 지금 실행** 순서로 시연합니다.
- 모니터링 화면의 **시연 준비: 기준에서 1건 삭제** → **지금 실행**으로 "신규 1건 감지" 장면을 만들 수 있습니다.

## 환경 변수

`.env.example` 참고. 값은 `.env.local`(로컬) 또는 Vercel Project Settings에만 둡니다.

| 이름 | 용도 |
|---|---|
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Neon (Vercel 통합 시 자동 주입) |
| `KIPRIS_PLUS_API_KEY` | KIPRIS Plus 인증키 |
| `ANTHROPIC_API_KEY`, `CLAUDE_MODEL` | 분류·청구항 분해 (기본 `claude-sonnet-5-5`) |
| `CRON_SECRET` | `/api/cron/monitor` 검증 |
| `APP_PASSWORD`, `SESSION_SECRET` | 시연용 로그인 |
| `NOTIFY_SLACK_WEBHOOK` | 알림(선택) |

## 배포 (GitHub → Vercel → Neon)

1. GitHub 저장소에 push → Vercel에서 Import
2. Vercel Marketplace에서 Neon 통합 추가 (Preview마다 Neon 브랜치 옵션 활성화)
3. 환경 변수 등록 후 `npm run db:migrate` (로컬에서 `DATABASE_URL_UNPOOLED`를 Neon으로 지정해 실행)
4. 설정 화면 **KIPRIS 연결 테스트** → 대시보드 **전체 수집**
5. Cron: `vercel.json` — `0 22 * * 0` (UTC) = **매주 월요일 07:00 KST**, 함수 리전 `icn1`

## 명령

| 명령 | 내용 |
|---|---|
| `npm test` | Vitest (실제 KIPRIS 응답 픽스처 기반 정규화·diff·위험도·보고서 테스트) |
| `npm run db:generate` | 스키마 변경 → `drizzle/` SQL 생성 (생성 후 첫 마이그레이션처럼 확장 설치 줄 확인) |
| `npm run db:migrate` | Neon에 마이그레이션 적용 |
| `npm run kipris:probe -- "<출원인명>"` | KIPRIS 검색·상세 응답 구조 점검 (키는 출력하지 않음) |

## 구조

```
app/(dashboard)/          대시보드 · 특허 목록/상세 · 모니터링 · 회차 보고서 · 설정
app/api/                  cron/monitor · collect · classify · analyze · monitor · export · health
app/actions.ts            버튼용 Server Actions (Route Handler와 같은 lib/ 로직 공유)
lib/kipris/               client(재시도·300ms 간격·키 마스킹) · search · detail · normalize
lib/domain/               taxonomy · status · risk(결정적 규칙) · diff(순수 함수)
lib/ai/                   Claude 구조화 출력 · classify · claim-chart · prompts/
lib/jobs/                 collect · classify · analyze · monitor · sync(트랜잭션) · risk
lib/report/               markdown(요약·청구항 분해·모니터링) · csv · 금지어 검사
proxy.ts                  인증 게이트 (Next.js 16)
```

## 명세와 다르게 구현한 점

- **구조화 출력**: 명세는 `tool_choice` 강제를 적었지만 Sonnet 5.5는 강제 `tool_choice`(any/tool)를 400으로 거부합니다.
  같은 목적(JSON만 받기)을 Structured Outputs(`output_config.format` + Zod)로 구현했습니다. 정책 거절 시 서버측 폴백(`fallbacks: "default"`)을 켜 두었습니다.
- **프롬프트 위치**: Vercel 번들 안정성을 위해 `lib/ai/prompts/*.ts`(문자열 상수)로 두었습니다. 버전은 `prompt_version`으로 저장됩니다.
- **UI 컴포넌트**: shadcn/ui 대신 업무시스템 스타일 테마(`app/globals.css`)와 경량 컴포넌트(`components/`)로 구성했습니다.
- **로컬 데모 DB**: `DATABASE_URL`이 없을 때 PGlite로 동작하는 폴백을 추가했습니다 (운영은 Neon).
- **층위 미분류 위험도**: 계산하지 않고 "분류 필요"로 표시합니다 (비유효 상태는 '하').
- **부록 B 시드**: 출원번호를 모르므로 `WEB-<등록번호>` 임시 키로 넣고, 수집 시 같은 등록번호의 API 레코드로 분류를 넘긴 뒤 삭제합니다.

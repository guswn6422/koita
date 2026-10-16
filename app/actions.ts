"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { applicantAliases, monitorEvents, settings } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/queries";
import { createSessionValue, passwordMatches, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/session";
import { requireSession } from "@/lib/auth/guard";
import { deadlineFrom, runCollect } from "@/lib/jobs/collect";
import { classifyPending, setManualClassification } from "@/lib/jobs/classify";
import { analyzePatent } from "@/lib/jobs/analyze";
import { demoDeleteLatest, runMonitor, startOrResumeRun } from "@/lib/jobs/monitor";
import { recomputeRisk } from "@/lib/jobs/risk";
import { kiprisHealth } from "@/lib/kipris/health";
import { maskKey } from "@/lib/kipris/client";
import { FAMILIES, LAYERS, type FamilyCode, type LayerCode } from "@/lib/domain/taxonomy";

export type ActionState = { ok: boolean; message: string; lines?: string[] } | null;

const MAX_SEC = 300;
const errMsg = (e: unknown) => maskKey(e instanceof Error ? e.message : String(e));

// ── 인증 ───────────────────────────────────────────────
export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const password = String(fd.get("password") ?? "");
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) {
    return { ok: false, message: "서버에 APP_PASSWORD / SESSION_SECRET 환경 변수가 설정되지 않았습니다." };
  }
  if (!passwordMatches(password)) return { ok: false, message: "비밀번호가 올바르지 않습니다." };
  (await cookies()).set(SESSION_COOKIE, await createSessionValue(), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_MAX_AGE,
  });
  const next = String(fd.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logoutAction() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/login");
}

// ── 수집·분류·분석·모니터링 ─────────────────────────────
export async function collectAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const started = Date.now();
  try {
    const r = await runCollect({ dryRun: fd.get("dryRun") === "1", deadline: deadlineFrom(MAX_SEC, started) });
    revalidatePath("/", "layout");
    const alias = Object.entries(r.hitsByAlias).map(([k, v]) => `${k}: ${v}건`);
    return {
      ok: true,
      message: fd.get("dryRun") === "1"
        ? `시험 수집 완료 — 조회 ${r.fetched}건, 중복 제거 후 ${r.unique}건 (DB 미반영)`
        : `수집 완료 — 조회 ${r.fetched}건 → 고유 ${r.unique}건 반영${r.partial ? " (시간 제한으로 일부만 수집됨 — 다시 실행하세요)" : ""}`,
      lines: [
        `별칭별 검색 건수 — ${alias.join(" · ")}`,
        `KIPRIS 호출 ${r.apiCalls}회`,
        ...("total" in r && process.env.ANTHROPIC_API_KEY ? [`AI 분류 ${r.classified}건 완료 · 미분류 대기 ${r.remaining}건`] : []),
        ...r.aiErrors.map((e) => `⚠️ ${e}`),
      ],
    };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function classifyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const started = Date.now();
  try {
    const db = await getDb();
    const s = await getSettings(db);
    const limit = Math.min(Math.max(Number(fd.get("limit") ?? 30) || 30, 1), 200);
    const r = await classifyPending(db, { limit, deadline: deadlineFrom(MAX_SEC, started), highMax: s.high_max_elements });
    revalidatePath("/", "layout");
    return {
      ok: r.errors.length === 0 || r.classified > 0,
      message: `AI 분류 ${r.classified}건 완료 · 남은 미분류 ${r.remaining}건`,
      lines: r.errors.map((e) => `⚠️ ${e}`),
    };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function reclassifyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const appNo = String(fd.get("appNo"));
  try {
    const db = await getDb();
    const s = await getSettings(db);
    const r = await classifyPending(db, { appNos: [appNo], limit: 1, force: true, highMax: s.high_max_elements });
    revalidatePath(`/patents/${appNo}`);
    return r.errors.length ? { ok: false, message: r.errors.join(" / ") } : { ok: true, message: "AI 재분류 완료" };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function manualClassifyAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const appNo = String(fd.get("appNo"));
  const family = String(fd.get("family")) as FamilyCode;
  const layer = String(fd.get("layer")) as LayerCode;
  if (![...FAMILIES, "UNCLASSIFIED"].includes(family) || ![...LAYERS, "UNCLASSIFIED"].includes(layer)) {
    return { ok: false, message: "계열·층위 값이 올바르지 않습니다." };
  }
  const db = await getDb();
  const s = await getSettings(db);
  await setManualClassification(db, { appNo, family, layer, note: String(fd.get("note") ?? ""), highMax: s.high_max_elements });
  revalidatePath(`/patents/${appNo}`);
  return { ok: true, message: `수동 분류 저장: ${family} · ${layer} (AI 분류보다 우선)` };
}

export async function analyzeAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const appNo = String(fd.get("appNo"));
  try {
    const r = await analyzePatent(await getDb(), appNo, { claimText: String(fd.get("claimText") ?? "") || undefined });
    revalidatePath(`/patents/${appNo}`);
    return {
      ok: true,
      message: `청구항 분해 완료 — 제${r.chart.claimNo}항, 구성요소 ${r.chart.elementCount}개`,
      lines: r.warnings.length ? [`⚠️ 금지 표현 발견: ${r.warnings.join(", ")} — 보고서 사용 전 문구를 확인하세요.`] : [],
    };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function monitorAction(): Promise<ActionState> {
  await requireSession();
  const started = Date.now();
  try {
    const run = await startOrResumeRun("MANUAL");
    const r = await runMonitor(run!, deadlineFrom(MAX_SEC, started));
    revalidatePath("/", "layout");
    const st = r.stats ?? { added: 0, changed: 0, high: 0, fetched: 0 };
    return {
      ok: r.state !== "FAILED",
      message:
        r.state === "FAILED"
          ? `회차 #${r.id} 실패 — ${r.error}`
          : `회차 #${r.id} ${r.state === "PARTIAL" ? "일부 완료(이어서 실행 필요)" : "완료"} — 신규 ${st.added}건 · 상태변경 ${st.changed}건 · 위험도 상 ${st.high}건`,
      lines: [`KIPRIS 호출 ${r.apiCalls}회 · 조회 ${st.fetched}건`],
    };
  } catch (e) {
    return { ok: false, message: errMsg(e) };
  }
}

export async function demoDeleteAction(): Promise<ActionState> {
  await requireSession();
  const p = await demoDeleteLatest();
  revalidatePath("/", "layout");
  return p
    ? { ok: true, message: `시연 준비: 기준 DB에서 ${p.appNo} (${p.title}) 1건을 삭제했습니다. "지금 실행"을 누르면 신규 1건으로 감지됩니다.` }
    : { ok: false, message: "삭제할 API 레코드가 없습니다. 먼저 전체 수집을 실행하세요." };
}

export async function ackEventAction(fd: FormData) {
  await requireSession();
  const id = Number(fd.get("id"));
  const db = await getDb();
  if (fd.get("all") === "1") await db.update(monitorEvents).set({ acknowledged: true }).where(eq(monitorEvents.acknowledged, false));
  else if (id) await db.update(monitorEvents).set({ acknowledged: true }).where(eq(monitorEvents.id, id));
  revalidatePath("/", "layout");
}

// ── 설정 ───────────────────────────────────────────────
export async function kiprisTestAction(): Promise<ActionState> {
  await requireSession();
  const r = await kiprisHealth();
  return r.ok
    ? { ok: true, message: `${r.message} (${r.ms}ms)`, lines: [`${r.appNo} · ${r.title} · ${r.status} · 청구항 ${r.claims}개`] }
    : { ok: false, message: `연결 실패 — ${r.message}`, lines: ["0건이면 별칭 표기·파라미터명을, 오류 코드가 오면 키·활용신청 상태를 점검하세요."] };
}

export async function aliasAddAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { ok: false, message: "별칭을 입력하세요." };
  const db = await getDb();
  await db.insert(applicantAliases).values({ name, active: true, note: String(fd.get("note") ?? "") || null }).onConflictDoNothing();
  revalidatePath("/settings");
  return { ok: true, message: `별칭 추가: ${name}` };
}

export async function aliasToggleAction(fd: FormData) {
  await requireSession();
  const db = await getDb();
  await db.update(applicantAliases).set({ active: fd.get("active") === "1" }).where(eq(applicantAliases.id, Number(fd.get("id"))));
  revalidatePath("/settings");
}

export async function aliasDeleteAction(fd: FormData) {
  await requireSession();
  const db = await getDb();
  await db.delete(applicantAliases).where(eq(applicantAliases.id, Number(fd.get("id"))));
  revalidatePath("/settings");
}

export async function settingsSaveAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  await requireSession();
  const int = (k: string, min: number, max: number) => Math.min(Math.max(Math.round(Number(fd.get(k))), min), max);
  const values = {
    high_max_elements: int("high_max_elements", 1, 20),
    rows: int("rows", 10, 500),
    max_pages: int("max_pages", 1, 50),
    auto_analyze_limit: int("auto_analyze_limit", 0, 10),
  };
  if (Object.values(values).some((v) => Number.isNaN(v))) return { ok: false, message: "숫자를 입력하세요." };
  const codes = String(fd.get("ipc") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const ipc = codes.map((line) => {
    const [code, meaning = "", flag = ""] = line.split("|").map((s) => s.trim());
    return { code, meaning, tentative: flag !== "확정" };
  });
  const db = await getDb();
  const entries = { ...values, ipc_supplementary: ipc } as Record<string, unknown>;
  for (const [key, value] of Object.entries(entries)) {
    await db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
  }
  // 임계값이 바뀌면 위험도를 전부 다시 계산
  const all = await db.query.patents.findMany({ columns: { appNo: true } });
  await recomputeRisk(db, all.map((p) => p.appNo), values.high_max_elements);
  revalidatePath("/", "layout");
  return { ok: true, message: "설정을 저장하고 위험도를 다시 계산했습니다." };
}

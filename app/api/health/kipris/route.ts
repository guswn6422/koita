import { kiprisHealth } from "@/lib/kipris/health";

export const dynamic = "force-dynamic";

/** KIPRIS 연결 테스트 (detail 1건) */
export async function GET() {
  const r = await kiprisHealth();
  return Response.json(r, { status: r.ok ? 200 : 502 });
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PageHeader, Panel } from "@/components/ui";
import { getDb } from "@/lib/db";
import { monitorRuns } from "@/lib/db/schema";
import { findBannedTerms } from "@/lib/report/compliance";

export default async function RunReportPage({ params }: { params: Promise<{ runId: string }> }) {
  const id = Number((await params).runId);
  if (!Number.isInteger(id)) notFound();
  const [run] = await (await getDb()).select().from(monitorRuns).where(eq(monitorRuns.id, id));
  if (!run) notFound();
  const banned = run.reportMd ? findBannedTerms(run.reportMd) : [];

  return (
    <div className="space-y-4">
      <PageHeader
        crumbs={["모니터링", `회차 #${run.id}`]}
        title={`모니터링 회차 #${run.id} 보고서`}
        desc="주간 보고서(.md) 미리보기 — 다운로드해 메일·위키에 그대로 붙일 수 있습니다"
        actions={
          <>
            <Link className="btn btn-line" href="/monitor">회차 목록</Link>
            {run.reportMd && <a className="btn btn-primary" href={`/api/export/report/${run.id}`}>⤓ .md 다운로드</a>}
          </>
        }
      />
      {banned.length > 0 && (
        <div className="notice notice-warn">⚠️ 보고서에 금지 표현({banned.join(", ")})이 있습니다. 법적 결론으로 읽히지 않도록 문구를 확인하세요.</div>
      )}
      <Panel>
        {run.reportMd ? (
          <article className="md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{run.reportMd}</ReactMarkdown>
          </article>
        ) : (
          <p className="text-[13px] text-ink-3">아직 보고서가 생성되지 않았습니다 (실행 중이거나 중단됨).</p>
        )}
      </Panel>
    </div>
  );
}

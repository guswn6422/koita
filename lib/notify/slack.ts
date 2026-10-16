import "server-only";

/** Slack Incoming Webhook 알림(선택). 설정이 없으면 아무 것도 하지 않는다 */
export async function notifySlack(text: string) {
  const url = process.env.NOTIFY_SLACK_WEBHOOK?.trim();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

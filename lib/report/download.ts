/** .md 파일 다운로드 응답 (한글 파일명은 RFC 5987 형식으로) */
export function mdResponse(markdown: string, filename: string) {
  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${filename.replace(/[^\w.-]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTT 특허 모니터링 시스템",
  description: "GTT LNG 화물창 단열시스템 한국 특허 분석·모니터링 (KIPRIS 기반 1차 기술 검토 데모)",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

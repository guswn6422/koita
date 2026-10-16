"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MENU = [
  { href: "/", label: "대시보드", icon: "▦" },
  { href: "/patents", label: "특허 목록", icon: "≣" },
  { href: "/monitor", label: "모니터링", icon: "◷" },
  { href: "/settings", label: "설정", icon: "⚙" },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

/** 좌측 LNB (데스크톱) */
export function SideNav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col py-3" aria-label="주 메뉴">
      <div className="px-5 pb-2 pt-1 text-[11px] font-semibold tracking-wider text-ink-3">특허 분석</div>
      {MENU.map((m) => {
        const active = isActive(path, m.href);
        return (
          <Link
            key={m.href}
            href={m.href}
            className={`flex items-center gap-3 border-l-[3px] px-5 py-2.5 text-[14px] ${
              active ? "border-blue bg-[#eef3fa] font-bold text-blue" : "border-transparent text-ink-2 hover:bg-[#f5f7fa] hover:text-navy"
            }`}
          >
            <span className="w-4 text-center text-[13px] opacity-70" aria-hidden>{m.icon}</span>
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** 상단 GNB 메뉴 (모바일·태블릿) */
export function TopNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:hidden" aria-label="주 메뉴">
      {MENU.map((m) => (
        <Link
          key={m.href}
          href={m.href}
          className={`whitespace-nowrap px-3 py-2 text-[13px] ${isActive(path, m.href) ? "border-b-2 border-sky font-bold text-white" : "text-white/75"}`}
        >
          {m.label}
        </Link>
      ))}
    </nav>
  );
}

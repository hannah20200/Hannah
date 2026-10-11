"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STEPS = [
  { path: "analyze", label: "분석" },
  { path: "draft", label: "원고" },
  { path: "photos", label: "사진" },
  { path: "preview", label: "미리보기 · 내보내기" },
];

export function StepNav({ id }: { id: string }) {
  const pathname = usePathname();
  const current = STEPS.findIndex((s) => pathname.endsWith(`/${s.path}`));
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      <span className="mr-2 font-mono text-xs text-muted">{id}</span>
      {STEPS.map((s, i) => (
        <Link
          key={s.path}
          href={`/posts/${encodeURIComponent(id)}/${s.path}`}
          className={`rounded-full px-4 py-1.5 font-bold ${
            i === current ? "bg-ink text-white" : "border border-line bg-paper text-muted hover:text-ink"
          }`}
        >
          {i + 1}. {s.label}
        </Link>
      ))}
    </nav>
  );
}

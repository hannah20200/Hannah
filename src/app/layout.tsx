import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";

export const metadata = {
  title: "작은 매거진 게시물 메이커",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen font-sans antialiased">
        <header className="border-b border-line bg-paper">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-lg font-extrabold tracking-tight">
              작은 매거진 <span className="font-semibold text-muted">게시물 메이커</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm font-bold">
              <Link href="/" className="text-muted hover:text-ink">
                새 게시물
              </Link>
              <Link href="/board" className="text-muted hover:text-ink">
                콘텐츠 보드
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}

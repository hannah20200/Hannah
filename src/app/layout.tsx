import type { ReactNode } from "react";

export const metadata = {
  title: "작은 매거진 게시물 메이커",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

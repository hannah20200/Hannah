"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { canvas, font } from "@/templates/tokens";
import type { Draft, Photo } from "@/lib/schema";
import { photoUrl } from "./client";

/** 렌더러와 같은 규칙: 한 줄 텍스트가 넘치면 글자 크기를 줄인다 */
function fit(root: HTMLElement) {
  for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-fit]"))) {
    // 원래 크기(React가 넣은 inline style)를 기억해 두고 매번 거기서 다시 시작
    el.dataset.baseSize ??= el.style.fontSize || getComputedStyle(el).fontSize;
    el.style.fontSize = el.dataset.baseSize;
    const base = parseFloat(el.dataset.baseSize);
    let size = base;
    while (el.scrollWidth > el.clientWidth + 1 && size > base * font.minFitScale) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }
}

/** 1080×1350 슬라이드를 축소해서 보여준다 */
export function SlidePreview({ children, width = 300, deps }: { children: ReactNode; width?: number; deps?: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const scale = width / canvas.width;
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    fit(el);
    // 폰트가 늦게 로드되면 한 번 더
    document.fonts?.ready.then(() => fit(el));
  }, [deps]);
  return (
    <div className="shrink-0 overflow-hidden rounded-lg shadow-md" style={{ width, height: canvas.height * scale }}>
      <div ref={ref} style={{ width: canvas.width, height: canvas.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

/** 원고 안의 사진 경로를 브라우저 URL로 바꾼 사본 */
export function browserDraft(id: string, draft: Draft): Draft {
  const fix = (p?: Photo) => (p ? { ...p, src: photoUrl(id, p.src) } : p);
  return {
    ...draft,
    covers: draft.covers.map((c) => ({ ...c, photo: fix(c.photo), collage: c.collage?.map((p) => fix(p)!) })),
    intro: draft.intro.map((s) => ({ ...s, photo: fix(s.photo) })),
    items: draft.items.map((s) => ({ ...s, photo: fix(s.photo) })),
    end: { ...draft.end, photo: fix(draft.end.photo) },
  };
}

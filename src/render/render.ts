import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium, type Browser } from "playwright";
import { FONT_DIR } from "../lib/paths";
import type { Draft, Photo } from "../lib/schema";
import { Cover } from "../templates/Cover";
import { End } from "../templates/End";
import { Page } from "../templates/Page";
import { canvas, font } from "../templates/tokens";


export type SlideSpec = { name: string; element: ReactElement };

/** 원고 → 슬라이드 목록 (00_표지A, 00_표지B, 01_도입, 02~07 항목, 08_마무리) */
export function buildSlides(draft: Draft): SlideSpec[] {
  const slides: SlideSpec[] = [];
  const covers = [...draft.covers].sort((a, b) => a.variant.localeCompare(b.variant));
  for (const c of covers) slides.push({ name: `00_표지${c.variant}`, element: createElement(Cover, { data: c }) });

  let n = 1;
  const pad = (i: number) => String(i).padStart(2, "0");
  draft.intro.forEach((intro, i) => {
    const suffix = draft.intro.length > 1 ? String(i + 1) : "";
    slides.push({ name: `${pad(n++)}_도입${suffix}`, element: createElement(Page, { kind: "intro", data: intro }) });
  });
  draft.items.forEach((item, i) => {
    slides.push({ name: `${pad(n++)}_항목${i + 1}`, element: createElement(Page, { kind: "item", data: item }) });
  });
  slides.push({ name: `${pad(n)}_마무리`, element: createElement(End, { data: draft.end }) });
  return slides;
}

/** 원고 안의 사진 경로(상대경로)를 렌더러가 읽을 수 있는 URL로 바꾼다 */
export function resolvePhotos(draft: Draft, baseDir: string): Draft {
  const fix = <T extends Photo | undefined>(p: T): T => {
    if (!p) return p;
    if (/^(https?|file|data):/.test(p.src)) return p;
    return { ...p, src: pathToFileURL(path.resolve(baseDir, p.src)).href } as T;
  };
  return {
    ...draft,
    covers: draft.covers.map((c) => ({ ...c, photo: fix(c.photo), collage: c.collage?.map(fix) })),
    intro: draft.intro.map((s) => ({ ...s, photo: fix(s.photo) })),
    items: draft.items.map((s) => ({ ...s, photo: fix(s.photo) })),
    end: { ...draft.end, photo: fix(draft.end.photo) },
  };
}

export function fontFaceCss(): string {
  return font.files
    .map((f) => {
      const url = pathToFileURL(path.join(FONT_DIR, f.file)).href;
      return `@font-face{font-family:"${f.family}";font-weight:${f.weight};font-style:normal;font-display:block;src:url("${url}") format("${f.format}");}`;
    })
    .join("\n");
}

export function toHtml(element: ReactElement): string {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<style>
${fontFaceCss()}
html,body{margin:0;padding:0;background:#000;}
*{-webkit-font-smoothing:antialiased;}
</style></head>
<body>${renderToStaticMarkup(element)}</body></html>`;
}

export type RenderResult = { dir: string; files: string[]; warnings: string[] };

/**
 * 각 슬라이드를 HTML로 만들고 Playwright로 1080×1350 PNG 캡처.
 * 결과: {outRoot}/{postId}/{00_표지A, 00_표지B, 01_도입, ...}.png
 */
export async function renderPost(draft: Draft, opts: { outRoot: string; postId: string }): Promise<RenderResult> {
  const dir = path.join(opts.outRoot, opts.postId);
  const htmlDir = path.join(dir, "html");
  await rm(dir, { recursive: true, force: true });
  await mkdir(htmlDir, { recursive: true });

  const slides = buildSlides(draft);
  const files: string[] = [];
  const warnings: string[] = [];

  const browser: Browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
  });
  try {
    const page = await browser.newPage({
      viewport: { width: canvas.width, height: canvas.height },
      deviceScaleFactor: 1,
    });
    for (const slide of slides) {
      const htmlPath = path.join(htmlDir, `${slide.name}.html`);
      await writeFile(htmlPath, toHtml(slide.element), "utf8");
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });

      const result = await page.evaluate(async (minScale: number) => {
        await document.fonts.ready;
        const problems: string[] = [];
        if (!document.fonts.check(`800 40px Pretendard`)) problems.push("Pretendard 폰트를 불러오지 못했습니다");
        for (const img of Array.from(document.images)) {
          if (!img.complete || img.naturalWidth === 0) problems.push(`이미지 로드 실패: ${img.src}`);
        }
        // 한 줄 텍스트가 넘치면 글자 크기를 줄인다
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-fit]"))) {
          const base = parseFloat(getComputedStyle(el).fontSize);
          let size = base;
          while (el.scrollWidth > el.clientWidth + 1 && size > base * minScale) {
            size -= 1;
            el.style.fontSize = `${size}px`;
          }
          if (el.scrollWidth > el.clientWidth + 1) problems.push(`텍스트가 넘칩니다: "${el.textContent}"`);
          else if (size < base) problems.push(`글자 크기 축소 ${base}→${size}px: "${el.textContent}"`);
        }
        // 텍스트가 캔버스 아래(크레딧 영역)까지 내려오는지 확인
        const slide = document.getElementById("slide")!;
        const limit = slide.getBoundingClientRect().top + 1280;
        for (const el of Array.from(slide.querySelectorAll<HTMLElement>("div"))) {
          const isText = el.childElementCount === 0 || el.hasAttribute("data-fit");
          if (isText && el.textContent && !el.textContent.startsWith("photo |")) {
            if (el.getBoundingClientRect().bottom > limit) problems.push(`하단 여백 부족: "${el.textContent}"`);
          }
        }
        return problems;
      }, font.minFitScale);
      warnings.push(...result.map((w) => `[${slide.name}] ${w}`));

      const file = path.join(dir, `${slide.name}.png`);
      await page.locator("#slide").screenshot({ path: file, animations: "disabled" });
      files.push(file);
    }

    await writeFile(path.join(dir, "caption.txt"), `${draft.caption.trim()}\n\n${draft.hashtags.join(" ")}\n`, "utf8");
    files.push(path.join(dir, "caption.txt"));

    // 검토용 전체 그리드 (게시물에는 쓰지 않음)
    const grid = path.join(dir, "_grid.png");
    await renderGrid(browser, files.filter((f) => f.endsWith(".png")), grid);
    files.push(grid);
  } finally {
    await browser.close();
  }
  return { dir, files, warnings };
}

async function renderGrid(browser: Browser, pngs: string[], out: string) {
  const cols = 5;
  const w = 270;
  const h = Math.round((w * canvas.height) / canvas.width);
  const gap = 12;
  const rows = Math.ceil(pngs.length / cols);
  const html = `<!doctype html><html><body style="margin:0;background:#2a2622;padding:${gap}px;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:${gap}px;width:max-content">
${pngs.map((p) => `<img src="${pathToFileURL(p).href}" style="width:${w}px;height:${h}px;display:block">`).join("\n")}
</body></html>`;
  const htmlPath = out.replace(/\.png$/, ".html");
  await writeFile(htmlPath, html, "utf8");
  const page = await browser.newPage({
    viewport: { width: cols * w + (cols + 1) * gap, height: rows * h + (rows + 1) * gap },
  });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
  await page.screenshot({ path: out, fullPage: true });
  await page.close();
  await rm(htmlPath);
}

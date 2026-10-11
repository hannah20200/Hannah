/**
 * 사진 후보 시트: 검색어마다 후보(최대 10장)를 번호와 함께 보여준다 (고른 사진은 노란 테두리).
 * `npm run photos -- ... --pick item.3=2` 로 바꿀 때 번호를 보는 용도.
 */
import { rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import type { Candidate } from "../lib/photos";
import { color } from "../templates/tokens";
import { fontFaceCss } from "./render";

export type SheetRow = {
  query: string;
  candidates: Candidate[];
  /** 후보 key → 그 사진을 쓰는 자리 이름들 */
  usedBy: Record<string, string[]>;
};

export type SheetUpload = { label: string; src: string; credit: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export function sheetHtml(rows: SheetRow[], uploads: SheetUpload[]): string {
  const card = (c: Candidate, i: number, used: string[]) => `
    <div class="card${used.length ? " on" : ""}">
      <div class="img"><img src="${esc(c.thumb)}"><span class="n">${i + 1}</span></div>
      <div class="meta">${esc(c.author)} · ${c.source === "unsplash" ? "Unsplash" : "Pexels"}<br>${c.width}×${c.height}</div>
      ${used.length ? `<div class="used">${used.map(esc).join(", ")}</div>` : ""}
    </div>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
${fontFaceCss()}
body{margin:0;padding:28px;background:#2a2622;color:#f3ede4;font-family:Pretendard,sans-serif;width:1360px}
h2{font-size:20px;font-weight:700;margin:26px 0 10px} h2 small{font-weight:500;color:#bdb3a6;margin-left:8px}
.row{display:flex;flex-wrap:wrap;gap:14px;max-width:1360px}
.card{width:212px;background:#3a342f;border-radius:6px;padding:6px;box-sizing:border-box;border:3px solid transparent}
.card.on{border-color:${color.butter}}
.img{position:relative;height:250px;overflow:hidden;border-radius:3px;background:#555}
.img img{width:100%;height:100%;object-fit:cover;display:block}
.n{position:absolute;left:6px;top:6px;background:rgba(0,0,0,.65);color:#fff;font-weight:800;font-size:18px;border-radius:14px;min-width:28px;height:28px;line-height:28px;text-align:center}
.meta{font-size:13px;color:#cfc6ba;margin-top:6px;line-height:1.4}
.used{font-size:13px;font-weight:700;color:${color.butter};margin-top:4px}
.empty{color:#bdb3a6;font-size:15px}
</style></head><body>
<div style="font-size:24px;font-weight:800">사진 후보</div>
<div style="color:#bdb3a6;margin-top:6px">바꾸기: npm run photos -- &lt;draft.json&gt; --pick 자리=번호 (예: --pick item.3=2)</div>
${rows
  .map((r) => {
    const slots = [...new Set(Object.values(r.usedBy).flat())];
    return `<h2>${esc(r.query)}<small>${esc(slots.join(" · "))}</small></h2>
<div class="row">${r.candidates.length ? r.candidates.map((c, i) => card(c, i, r.usedBy[c.key] ?? [])).join("") : '<div class="empty">후보 없음 — 검색어를 바꾸거나 --file로 직접 올려 주세요</div>'}</div>`;
  })
  .join("\n")}
${uploads.length ? `<h2>직접 올린 사진</h2><div class="row">${uploads
    .map((u) => `<div class="card on"><div class="img"><img src="${esc(u.src)}"></div><div class="meta">${esc(u.credit)}</div><div class="used">${esc(u.label)}</div></div>`)
    .join("")}</div>` : ""}
</body></html>`;
}

export async function renderSheet(rows: SheetRow[], uploads: SheetUpload[], out: string): Promise<void> {
  const htmlPath = out.replace(/\.png$/, ".html");
  await writeFile(htmlPath, sheetHtml(rows, uploads), "utf8");
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage({ viewport: { width: 1416, height: 800 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await browser.close();
    await rm(htmlPath, { force: true });
  }
}

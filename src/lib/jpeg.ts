/**
 * PNG → JPEG (Instagram API는 JPEG만 받는다). 이미 있는 Playwright로 변환한다.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { canvas } from "../templates/tokens";

export async function pngsToJpegs(pngs: string[], outDir: string, quality = 92): Promise<string[]> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined });
  const out: string[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: canvas.width, height: canvas.height } });
    const html = path.join(outDir, "_convert.html");
    for (const [i, png] of pngs.entries()) {
      await writeFile(
        html,
        `<!doctype html><body style="margin:0"><img src="${pathToFileURL(png).href}" style="display:block;width:${canvas.width}px;height:${canvas.height}px">`,
      );
      await page.goto(pathToFileURL(html).href, { waitUntil: "load" });
      const file = path.join(outDir, `${String(i + 1).padStart(2, "0")}.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality });
      out.push(file);
    }
    await rm(html, { force: true });
  } finally {
    await browser.close();
  }
  return out;
}

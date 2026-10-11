/**
 * 레퍼런스 캡처 폴더 → 분석 JSON
 *   npm run analyze -- <캡처폴더> [--id 이름] [--dry-run]
 * 결과: work/{id}/analysis.json
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeReference, getModel, MAX_REFERENCE_IMAGES, SUPPORTED_IMAGE_EXTS } from "../lib/claude";
import { flag, has, log, positional, runCli } from "./common";

runCli(async () => {
  const [dirArg] = positional();
  if (!dirArg) throw new Error("사용법: npm run analyze -- <캡처폴더> [--id 이름] [--dry-run]");

  const dir = path.resolve(dirArg);
  const names = (await readdir(dir))
    .filter((f) => SUPPORTED_IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (names.length === 0) throw new Error(`이미지가 없습니다: ${dir} (${SUPPORTED_IMAGE_EXTS.join(", ")})`);
  if (names.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`이미지는 최대 ${MAX_REFERENCE_IMAGES}장입니다 (현재 ${names.length}장)`);
  }

  const images = await Promise.all(names.map(async (name) => ({ name, data: await readFile(path.join(dir, name)) })));
  const id = flag("id") ?? path.basename(dir);
  const outDir = path.resolve("work", id);

  log(`레퍼런스 ${images.length}장 (슬라이드 순서):`);
  images.forEach((img, i) => log(`  ${i + 1}. ${img.name} (${(img.data.length / 1024).toFixed(0)}KB)`));

  if (has("dry-run")) {
    log(`\n[dry-run] API를 호출하지 않았습니다. 모델: ${getModel()}, 저장 위치: ${path.relative(process.cwd(), outDir)}/analysis.json`);
    return;
  }

  const analysis = await analyzeReference(images, { log });
  await mkdir(outDir, { recursive: true });
  const out = path.join(outDir, "analysis.json");
  await writeFile(out, JSON.stringify(analysis, null, 2) + "\n", "utf8");

  log(`\n분석 완료 → ${path.relative(process.cwd(), out)}`);
  log(`  주제: ${analysis.theme}`);
  log(`  피해야 할 항목: ${analysis.items_to_avoid.join(" / ") || "(없음)"}`);
  log(`\n다음: npm run draft -- ${path.relative(process.cwd(), out)} --topic "주제 메모"`);
});

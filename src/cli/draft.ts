/**
 * 분석 JSON → 원고 JSON
 *   npm run draft -- <analysis.json> [--topic "주제"] [--owned 목록.txt] [--out 경로] [--dry-run]
 * 결과: 분석 파일과 같은 폴더의 draft.json
 * 목록.txt: 직접 써본 책·제품을 한 줄에 하나씩 (#으로 시작하는 줄은 무시)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDraftPrompt, generateDraft, getModel } from "../lib/claude";
import { AnalysisSchema } from "../lib/schema";
import { flag, has, log, positional, runCli } from "./common";

runCli(async () => {
  const [analysisArg] = positional();
  if (!analysisArg) {
    throw new Error('사용법: npm run draft -- <analysis.json> [--topic "주제"] [--owned 목록.txt] [--out 경로] [--dry-run]');
  }

  const analysisPath = path.resolve(analysisArg);
  const parsed = AnalysisSchema.safeParse(JSON.parse(await readFile(analysisPath, "utf8")));
  if (!parsed.success) {
    throw new Error(`분석 JSON 형식이 맞지 않습니다:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }

  const ownedPath = flag("owned");
  const owned = ownedPath
    ? (await readFile(path.resolve(ownedPath), "utf8"))
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("#"))
    : undefined;
  const input = { analysis: parsed.data, topic: flag("topic"), owned };
  const out = path.resolve(flag("out") ?? path.join(path.dirname(analysisPath), "draft.json"));

  if (has("dry-run")) {
    log(await buildDraftPrompt(input));
    log(`\n[dry-run] 위 프롬프트로 요청합니다 (API 호출 안 함). 모델: ${getModel()}, 저장 위치: ${path.relative(process.cwd(), out)}`);
    return;
  }

  const { draft, overlaps, regenerated } = await generateDraft(input, { log });
  await writeFile(out, JSON.stringify(draft, null, 2) + "\n", "utf8");

  log(`\n원고 완료${regenerated ? " (겹침 때문에 1회 재생성)" : ""} → ${path.relative(process.cwd(), out)}`);
  for (const c of draft.covers) log(`  표지${c.variant}: ${c.title.join(" ")}`);
  for (const item of draft.items) log(`  [${item.pillar}] ${item.head}  —  ${item.pick}`);
  log(`  self_check: ${draft.self_check.notes}`);
  if (overlaps.length) {
    log("\n확인할 점: 레퍼런스와 비슷한 항목이 남아 있습니다");
    for (const o of overlaps) log(`  ! "${o.head}" ↔ "${o.reference}" (유사도 ${o.score})`);
  }
  log(`\n다음: npm run render -- ${path.relative(process.cwd(), out)}  (사진은 3단계 전까지 대체 배경)`);
});

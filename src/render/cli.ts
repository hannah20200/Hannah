/**
 * 원고 JSON → PNG 렌더링 CLI
 *   npx tsx src/render/cli.ts <원고.json> [--out out] [--id postId]
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { DraftSchema } from "../lib/schema";
import { renderPost, resolvePhotos } from "./render";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith("--")) {
    console.error("사용법: tsx src/render/cli.ts <원고.json> [--out out] [--id postId]");
    process.exit(1);
  }
  const jsonPath = path.resolve(input);
  const parsed = DraftSchema.safeParse(JSON.parse(await readFile(jsonPath, "utf8")));
  if (!parsed.success) {
    console.error("원고 JSON이 스키마와 맞지 않습니다:");
    for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    process.exit(1);
  }

  const draft = resolvePhotos(parsed.data, path.dirname(jsonPath));
  // work/{id}/draft.json 은 폴더 이름을 게시물 이름으로 쓴다
  const base = path.basename(jsonPath, ".json");
  const postId = arg("id") ?? (base === "draft" ? path.basename(path.dirname(jsonPath)) : base);
  const outRoot = path.resolve(arg("out") ?? "out");

  const started = Date.now();
  const { dir, files, warnings } = await renderPost(draft, { outRoot, postId });
  console.log(`렌더링 완료 (${((Date.now() - started) / 1000).toFixed(1)}s) → ${path.relative(process.cwd(), dir)}/`);
  for (const f of files) console.log(`  ${path.relative(process.cwd(), f)}`);
  if (warnings.length) {
    console.log("\n확인할 점:");
    for (const w of warnings) console.log(`  ! ${w}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { cp } from "node:fs/promises";
import path from "node:path";
import { handle, jsonBody } from "@/lib/api";
import { SAMPLE_DIR } from "@/lib/paths";
import { DraftSchema } from "@/lib/schema";
import { createPost, listPosts, postDir, writeDraft } from "@/lib/store";
import { readFile } from "node:fs/promises";

/** GET /api/posts → 게시물 목록 */
export async function GET() {
  return handle(async () => ({ posts: await listPosts() }));
}

/** POST /api/posts {sample:true} → 샘플 원고로 새 게시물 (API 키 없이 화면 둘러보기용) */
export async function POST(request: Request) {
  return handle(async () => {
    const body = await jsonBody<{ sample?: boolean }>(request);
    if (!body.sample) return Response.json({ error: "새 게시물은 /api/analyze로 만듭니다" }, { status: 400 });
    const meta = await createPost({ topic: "샘플: 연말 취향 정리", refs: [] });
    const draft = DraftSchema.parse(JSON.parse(await readFile(path.join(SAMPLE_DIR, "taste_check.json"), "utf8")));
    // 샘플 사진(photos/*.svg)도 함께 복사
    await cp(path.join(SAMPLE_DIR, "photos"), path.join(postDir(meta.id), "photos"), { recursive: true });
    for (const p of [...draft.covers.flatMap((c) => [c.photo, ...(c.collage ?? [])]), ...draft.intro.map((s) => s.photo), ...draft.items.map((s) => s.photo), draft.end.photo]) {
      if (p) p.source = "placeholder";
    }
    await writeDraft(meta.id, draft);
    return { id: meta.id };
  });
}

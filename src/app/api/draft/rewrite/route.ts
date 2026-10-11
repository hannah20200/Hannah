import { handle, jsonBody } from "@/lib/api";
import { rewriteSlide } from "@/lib/claude";
import { readAnalysis, readDraft, StoreError, writeDraft } from "@/lib/store";

export const maxDuration = 300;

/** POST /api/draft/rewrite {id, target: "cover.A"|"intro.1"|"item.3"|"end", note?} → 한 장만 다시 쓰기 */
export async function POST(request: Request) {
  return handle(async () => {
    const { id, target, note } = await jsonBody<{ id: string; target: string; note?: string }>(request);
    const draft = await readDraft(id);
    if (!draft) throw new StoreError(400, "원고가 없습니다");
    const result = await rewriteSlide(
      { draft, analysis: await readAnalysis(id), target, note },
      { log: (m) => console.log(`[${id}]${m}`) },
    );
    await writeDraft(id, result.draft);
    return result;
  });
}

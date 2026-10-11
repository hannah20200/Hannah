import { handle, jsonBody } from "@/lib/api";
import { generateDraft } from "@/lib/claude";
import { DraftSchema } from "@/lib/schema";
import { readAnalysis, readMeta, StoreError, writeDraft } from "@/lib/store";

export const maxDuration = 300;

/** POST /api/draft {id} → 분석 + 주제 + 써본 것 목록으로 원고 생성 */
export async function POST(request: Request) {
  return handle(async () => {
    const { id } = await jsonBody<{ id: string }>(request);
    const meta = await readMeta(id);
    const analysis = await readAnalysis(id);
    if (!analysis) throw new StoreError(400, "먼저 레퍼런스를 분석해 주세요");
    const { draft, overlaps, regenerated } = await generateDraft(
      { analysis, topic: meta.topic, owned: meta.owned },
      { log: (m) => console.log(`[${id}]${m}`) },
    );
    const parsed = DraftSchema.parse(draft);
    await writeDraft(id, parsed);
    return { draft: parsed, overlaps, regenerated };
  });
}

/** PUT /api/draft {id, draft} → 화면에서 고친 원고 저장 */
export async function PUT(request: Request) {
  return handle(async () => {
    const { id, draft } = await jsonBody<{ id: string; draft: unknown }>(request);
    await readMeta(id);
    const parsed = DraftSchema.parse(draft);
    await writeDraft(id, parsed);
    return { draft: parsed };
  });
}

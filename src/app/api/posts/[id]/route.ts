import { handle } from "@/lib/api";
import { listSlots } from "@/lib/photo-plan";
import { listRendered, readAnalysis, readDraft, readMeta, readPhotoState } from "@/lib/store";

/** GET /api/posts/{id} → 게시물 전체 상태 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const meta = await readMeta(id);
    const draft = await readDraft(id);
    return {
      meta,
      analysis: (await readAnalysis(id)) ?? null,
      draft: draft ?? null,
      photoState: (await readPhotoState(id)) ?? null,
      slots: draft ? listSlots(draft) : [],
      rendered: await listRendered(id),
    };
  });
}

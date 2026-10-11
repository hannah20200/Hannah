import { handle, jsonBody } from "@/lib/api";
import { emptyState } from "@/lib/photo-plan";
import { matchPhotos } from "@/lib/photo-match";
import { postDir, readDraft, readPhotoState, StoreError, writeDraft, writePhotoState } from "@/lib/store";

export const maxDuration = 300;

/** POST /api/photos/match {id, picks?: {자리: 번호}, refresh?} → 사진 검색·배정·내려받기 */
export async function POST(request: Request) {
  return handle(async () => {
    const { id, picks, refresh } = await jsonBody<{ id: string; picks?: Record<string, number>; refresh?: boolean }>(request);
    const draft = await readDraft(id);
    if (!draft) throw new StoreError(400, "원고가 없습니다");
    const state = (await readPhotoState(id)) ?? emptyState();
    const { slots, empty } = await matchPhotos({ draft, draftDir: postDir(id), state, picks, refresh });
    await writeDraft(id, draft);
    await writePhotoState(id, state);
    return { draft, photoState: state, slots, empty };
  });
}

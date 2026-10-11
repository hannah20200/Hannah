import { handle, jsonBody } from "@/lib/api";
import { publishPost, schedulePost } from "@/lib/publish";
import { deletePublish, readPublish, StoreError } from "@/lib/store";

export const maxDuration = 300;

/**
 * POST /api/publish {id, cover: "A"|"B", at?: ISO 시각, now?: true}
 *  - at: 예약 (서버가 켜져 있으면 시간에 맞춰 게시)
 *  - now: 지금 바로 게시
 */
export async function POST(request: Request) {
  return handle(async () => {
    const { id, cover, at, now } = await jsonBody<{ id: string; cover: "A" | "B"; at?: string; now?: boolean }>(request);
    if (cover !== "A" && cover !== "B") throw new StoreError(400, "표지를 A 또는 B로 골라 주세요");
    if (now) {
      await schedulePost(id, cover, new Date());
      return { publish: await publishPost(id, { log: console.log }) };
    }
    if (!at) throw new StoreError(400, "예약 시각이 필요합니다");
    const when = new Date(at);
    if (when.getTime() < Date.now() - 60_000) throw new StoreError(400, "지난 시각으로는 예약할 수 없습니다");
    return { publish: await schedulePost(id, cover, when) };
  });
}

/** DELETE /api/publish?id= → 예약 취소 */
export async function DELETE(request: Request) {
  return handle(async () => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const state = await readPublish(id);
    if (state?.status === "publishing") throw new StoreError(409, "지금 게시하는 중이라 취소할 수 없습니다");
    if (state?.status === "published") throw new StoreError(400, "이미 게시된 게시물입니다");
    await deletePublish(id);
    return { publish: null };
  });
}

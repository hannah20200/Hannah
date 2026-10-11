import { randomBytes } from "node:crypto";
import { handle, jsonBody } from "@/lib/api";
import { readIdeas, StoreError, writeIdeas } from "@/lib/store";

/** POST /api/ideas {text} → 아이디어 메모 추가 */
export async function POST(request: Request) {
  return handle(async () => {
    const { text } = await jsonBody<{ text: string }>(request);
    if (!text?.trim()) throw new StoreError(400, "내용을 적어 주세요");
    const ideas = await readIdeas();
    ideas.unshift({ id: randomBytes(4).toString("hex"), text: text.trim().slice(0, 500), created_at: new Date().toISOString() });
    await writeIdeas(ideas);
    return { ideas };
  });
}

/** DELETE /api/ideas?id= */
export async function DELETE(request: Request) {
  return handle(async () => {
    const id = new URL(request.url).searchParams.get("id");
    const ideas = (await readIdeas()).filter((i) => i.id !== id);
    await writeIdeas(ideas);
    return { ideas };
  });
}

import path from "node:path";
import { fileUrl, handle, jsonBody } from "@/lib/api";
import { renderInChild } from "@/lib/render-process";
import { postDir, readDraft, StoreError } from "@/lib/store";

export const maxDuration = 300;

/** POST /api/render {id} → out/{id}/*.png */
export async function POST(request: Request) {
  return handle(async () => {
    const { id } = await jsonBody<{ id: string }>(request);
    if (!(await readDraft(id))) throw new StoreError(400, "원고가 없습니다");
    const { files, warnings } = await renderInChild(path.join(postDir(id), "draft.json"), id);
    const v = Date.now();
    const slides = files
      .filter((f) => f.endsWith(".png") && !path.basename(f).startsWith("_"))
      .map((f) => ({ name: path.basename(f, ".png"), url: fileUrl(id, "out", path.basename(f), v) }));
    return { slides, warnings };
  });
}

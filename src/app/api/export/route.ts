import { readFile } from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import { handle } from "@/lib/api";
import { listRendered, outDir, readDraft, StoreError } from "@/lib/store";

/** GET /api/export?id= → PNG zip (+ caption.txt) */
export async function GET(request: Request) {
  return handle(async () => {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const pngs = await listRendered(id);
    if (pngs.length === 0) throw new StoreError(400, "먼저 미리보기에서 PNG를 만들어 주세요");
    const draft = await readDraft(id);
    const zip = new JSZip();
    for (const f of pngs) zip.file(f, await readFile(path.join(outDir(id), f)));
    if (draft) zip.file("caption.txt", `${draft.caption.trim()}\n\n${draft.hashtags.join(" ")}\n`);
    const data = await zip.generateAsync({ type: "arraybuffer" });
    return new Response(data, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${id}.zip`)}`,
      },
    });
  });
}

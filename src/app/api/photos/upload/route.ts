import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { handle } from "@/lib/api";
import { emptyState } from "@/lib/photo-plan";
import { matchPhotos } from "@/lib/photo-match";
import { postDir, readDraft, readPhotoState, StoreError, writeDraft, writePhotoState } from "@/lib/store";

const EXTS = [".jpg", ".jpeg", ".png", ".webp"];

/** POST /api/photos/upload multipart {id, slot, file, credit?} → 한 자리에 직접 올린 사진 */
export async function POST(request: Request) {
  return handle(async () => {
    const form = await request.formData();
    const id = String(form.get("id") ?? "");
    const slot = String(form.get("slot") ?? "");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new StoreError(400, "사진 파일이 없습니다");
    const ext = path.extname(file.name).toLowerCase();
    if (!EXTS.includes(ext)) throw new StoreError(400, `지원하지 않는 형식: ${file.name} (${EXTS.join(", ")})`);
    if (file.size > 20 * 1024 * 1024) throw new StoreError(400, "20MB 이하 사진만 올릴 수 있습니다");

    const draft = await readDraft(id);
    if (!draft) throw new StoreError(400, "원고가 없습니다");
    const state = (await readPhotoState(id)) ?? emptyState();
    const tmp = path.join(postDir(id), `.upload-tmp${ext}`);
    await writeFile(tmp, Buffer.from(await file.arrayBuffer()));
    try {
      const credit = String(form.get("credit") ?? "").trim() || undefined;
      const { slots, empty } = await matchPhotos({ draft, draftDir: postDir(id), state, files: { [slot]: { path: tmp, credit } } });
      await writeDraft(id, draft);
      await writePhotoState(id, state);
      return { draft, photoState: state, slots, empty };
    } finally {
      await rm(tmp, { force: true });
    }
  });
}

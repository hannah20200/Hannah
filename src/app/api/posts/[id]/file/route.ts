import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { handle } from "@/lib/api";
import { safeFile, StoreError } from "@/lib/store";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

/** GET /api/posts/{id}/file?area=work|out&path=photos/a.jpg → 게시물 폴더 안의 파일 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const { id } = await params;
    const url = new URL(request.url);
    const area = url.searchParams.get("area") === "out" ? "out" : "work";
    const rel = url.searchParams.get("path") ?? "";
    const file = safeFile(id, area, rel);
    const type = TYPES[path.extname(file).toLowerCase()];
    if (!type || !existsSync(file)) throw new StoreError(404, "파일이 없습니다");
    return new Response(new Uint8Array(await readFile(file)), {
      headers: { "content-type": type, "cache-control": "no-cache" },
    });
  });
}

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { readPublish, safeFile } from "@/lib/store";

/**
 * GET /api/public/{id}/{token}/{NN.jpg} — Instagram 서버가 가져가는 게시용 JPEG.
 * 게시 중인 게시물의 비밀 토큰이 맞을 때만 열린다.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; token: string; file: string }> }) {
  try {
    const { id, token, file } = await params;
    const state = await readPublish(id);
    const ok =
      state?.status === "publishing" &&
      token.length === state.token.length &&
      timingSafeEqual(Buffer.from(token), Buffer.from(state.token)) &&
      /^\d{2}\.jpg$/.test(file);
    const path = ok ? safeFile(id, "out", `ig/${file}`) : "";
    if (!ok || !existsSync(path)) return new Response("not found", { status: 404 });
    return new Response(new Uint8Array(await readFile(path)), { headers: { "content-type": "image/jpeg" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

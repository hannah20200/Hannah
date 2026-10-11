import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { errorResponse, handle } from "@/lib/api";
import { analyzeReference, MAX_REFERENCE_IMAGES, SUPPORTED_IMAGE_EXTS } from "@/lib/claude";
import { createPost, postDir, readMeta, StoreError, writeAnalysis, writeMeta } from "@/lib/store";

export const maxDuration = 300;

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/analyze
 *  - 새 게시물: multipart (images: 파일 여러 개, 순서대로 / topic / owned: 줄바꿈 구분)
 *  - 다시 분석: JSON {id}
 */
export async function POST(request: Request) {
  return handle(async () => {
    let id: string;
    if (request.headers.get("content-type")?.includes("application/json")) {
      ({ id } = (await request.json()) as { id: string });
      await readMeta(id);
    } else {
      const form = await request.formData();
      const files = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
      if (files.length === 0) throw new StoreError(400, "레퍼런스 캡처를 1장 이상 올려 주세요");
      if (files.length > MAX_REFERENCE_IMAGES) throw new StoreError(400, `캡처는 최대 ${MAX_REFERENCE_IMAGES}장입니다`);
      for (const f of files) {
        const ext = path.extname(f.name).toLowerCase();
        if (!SUPPORTED_IMAGE_EXTS.includes(ext)) throw new StoreError(400, `지원하지 않는 형식: ${f.name} (${SUPPORTED_IMAGE_EXTS.join(", ")})`);
        if (f.size > MAX_BYTES) throw new StoreError(400, `5MB를 넘는 이미지: ${f.name}`);
      }
      const topic = String(form.get("topic") ?? "").trim() || undefined;
      const owned = String(form.get("owned") ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("#"));
      const meta = await createPost({ topic, owned: owned.length ? owned : undefined, refs: [] });
      id = meta.id;
      // 올린 순서 = 슬라이드 순서 (파일 이름 앞에 번호)
      meta.refs = [];
      for (const [i, f] of files.entries()) {
        const name = `${String(i + 1).padStart(2, "0")}${path.extname(f.name).toLowerCase()}`;
        await writeFile(path.join(postDir(id), "refs", name), Buffer.from(await f.arrayBuffer()));
        meta.refs.push(name);
      }
      await writeMeta(meta);
    }

    const meta = await readMeta(id);
    const images = await Promise.all(
      meta.refs.map(async (name) => ({ name, data: await readFile(path.join(postDir(id), "refs", name)) })),
    );
    try {
      const analysis = await analyzeReference(images, { log: (m) => console.log(`[${id}]${m}`) });
      await writeAnalysis(id, analysis);
      return { id, analysis };
    } catch (err) {
      // 캡처는 저장됐으니 id를 같이 돌려줘서 나중에 다시 분석할 수 있게
      return errorResponse(err, { id });
    }
  });
}

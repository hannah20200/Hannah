/**
 * 게시물 저장소: work/{id}/ (CLI와 같은 구조)
 *   meta.json, refs/ (레퍼런스 캡처), analysis.json, draft.json, photos.json, photos/
 * 렌더 결과: out/{id}/
 */
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { OUT_DIR, WORK_DIR } from "./paths";
import type { PhotoState } from "./photo-plan";
import { AnalysisSchema, DraftSchema, type Analysis, type Draft } from "./schema";

export const PostMetaSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  topic: z.string().optional(),
  owned: z.array(z.string()).optional(),
  /** refs/ 안의 파일 이름 (슬라이드 순서) */
  refs: z.array(z.string()),
});
export type PostMeta = z.infer<typeof PostMetaSchema>;

const ID_RE = /^[\p{L}\p{N}_-]{1,80}$/u;

export function assertId(id: string): string {
  if (!ID_RE.test(id)) throw new StoreError(400, `잘못된 게시물 id: ${id}`);
  return id;
}

export class StoreError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const postDir = (id: string) => path.join(WORK_DIR, assertId(id));
export const outDir = (id: string) => path.join(OUT_DIR, assertId(id));

export function newPostId(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `${date}-${Math.random().toString(36).slice(2, 6)}`;
}

async function readJson<T>(file: string, schema?: z.ZodType<T>): Promise<T | undefined> {
  if (!existsSync(file)) return undefined;
  const data = JSON.parse(await readFile(file, "utf8"));
  return schema ? schema.parse(data) : (data as T);
}

async function writeJson(file: string, data: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
}

export async function createPost(meta: Omit<PostMeta, "id" | "created_at">, id = newPostId()): Promise<PostMeta> {
  const full: PostMeta = { id, created_at: new Date().toISOString(), ...meta };
  await mkdir(path.join(postDir(id), "refs"), { recursive: true });
  await writeJson(path.join(postDir(id), "meta.json"), full);
  return full;
}

export async function readMeta(id: string): Promise<PostMeta> {
  const meta = await readJson(path.join(postDir(id), "meta.json"), PostMetaSchema);
  if (!meta) throw new StoreError(404, `게시물이 없습니다: ${id}`);
  return meta;
}
export const writeMeta = (meta: PostMeta) => writeJson(path.join(postDir(meta.id), "meta.json"), meta);

export const readAnalysis = (id: string) => readJson<Analysis>(path.join(postDir(id), "analysis.json"), AnalysisSchema);
export const writeAnalysis = (id: string, a: Analysis) => writeJson(path.join(postDir(id), "analysis.json"), a);

export const readDraft = (id: string) => readJson<Draft>(path.join(postDir(id), "draft.json"), DraftSchema);
export const writeDraft = (id: string, d: Draft) => writeJson(path.join(postDir(id), "draft.json"), d);

export const readPhotoState = (id: string) => readJson<PhotoState>(path.join(postDir(id), "photos.json"));
export const writePhotoState = (id: string, s: PhotoState) => writeJson(path.join(postDir(id), "photos.json"), s);

export async function listRendered(id: string): Promise<string[]> {
  const dir = outDir(id);
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".png") && !f.startsWith("_")).sort();
}

export type PostSummary = { id: string; created_at: string; title: string; step: "analysis" | "draft" | "photos" | "done" };

export async function listPosts(): Promise<PostSummary[]> {
  if (!existsSync(WORK_DIR)) return [];
  const out: PostSummary[] = [];
  for (const id of await readdir(WORK_DIR)) {
    if (!ID_RE.test(id) || !existsSync(path.join(WORK_DIR, id, "meta.json"))) continue;
    try {
      const meta = await readMeta(id);
      const draft = await readDraft(id).catch(() => undefined);
      const hasPhotos = existsSync(path.join(postDir(id), "photos.json"));
      const rendered = (await listRendered(id)).length > 0;
      out.push({
        id,
        created_at: meta.created_at,
        title: draft?.covers.find((c) => c.variant === "A")?.title.join(" ") ?? meta.topic ?? "(분석 전)",
        step: rendered ? "done" : hasPhotos ? "photos" : draft ? "draft" : "analysis",
      });
    } catch {
      // 깨진 폴더는 목록에서 뺀다
    }
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** 게시물 폴더 안의 파일 경로 (work/{id} 또는 out/{id} 밖으로 나가지 못하게) */
export function safeFile(id: string, area: "work" | "out", rel: string): string {
  const base = area === "work" ? postDir(id) : outDir(id);
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) throw new StoreError(400, "잘못된 경로");
  return full;
}

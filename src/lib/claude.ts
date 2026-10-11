/**
 * Claude API 호출은 이 파일 한 곳에서만 한다. (CLAUDE.md 기술 원칙)
 * - 모델명: 환경변수 CLAUDE_MODEL
 * - 출력: 구조화 출력(JSON schema) + zod 검증, 실패 시 1회 재시도
 * - 원고: 레퍼런스 겹침이 있으면 1회 재생성
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { findOverlaps, type Overlap } from "./overlap";
import {
  AnalysisSchema,
  DraftOutputBase,
  DraftOutputSchema,
  type Analysis,
  type DraftOutput,
} from "./schema";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;
type Effort = "low" | "medium" | "high" | "xhigh" | "max";

const PROMPT_DIR = path.resolve(import.meta.dirname, "../../prompts");
const DEFAULT_MODEL = "claude-opus-5-5";
/** 서버 측 거절 대체(fallbacks: "default")를 지원하는 모델 */
const FALLBACK_MODELS = new Set(["claude-fable-5-1", "claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);

export function getModel(): string {
  return process.env.CLAUDE_MODEL?.trim() || DEFAULT_MODEL;
}

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/** 테스트용: 가짜 클라이언트 주입 */
export function setClientForTesting(fake: unknown) {
  client = fake as Anthropic;
}

async function loadPrompt(name: string): Promise<string> {
  return (await readFile(path.join(PROMPT_DIR, name), "utf8")).trim();
}

export type Logger = (msg: string) => void;
const silent: Logger = () => {};

// ---------------------------------------------------------------------------
// 공통: JSON 요청 + 검증 + 1회 재시도
// ---------------------------------------------------------------------------

type JsonRequest<T> = {
  label: string;
  system: string;
  /** 대화 기록. 재시도는 이 배열 끝에 덧붙인다(append-only) */
  messages: MessageParam[];
  /** 규칙까지 포함한 최종 검증 스키마 */
  schema: z.ZodType<T>;
  /** 구조화 출력용 스키마 (refine 없는 순수 구조) */
  structure: z.ZodType;
  effort: Effort;
  log: Logger;
};

class RefusalError extends Error {}

async function send(req: JsonRequest<unknown>) {
  const model = getModel();
  const useFallback = FALLBACK_MODELS.has(model);
  const { type, schema } = zodOutputFormat(req.structure);

  const stream = getClient().beta.messages.stream({
    model,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    output_config: { effort: req.effort, format: { type, schema } },
    system: req.system,
    cache_control: { type: "ephemeral" },
    messages: req.messages,
    ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    const category = message.stop_details?.category ?? "unknown";
    throw new RefusalError(`[${req.label}] 모델이 요청을 거절했습니다 (category: ${category})`);
  }
  if (message.model !== model) req.log(`  · ${model} 대신 ${message.model}가 응답했습니다 (fallback)`);
  return message;
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function validate<T>(text: string, schema: z.ZodType<T>): { ok: true; data: T } | { ok: false; issues: string[] } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    return { ok: false, issues: [`JSON 파싱 실패: ${(err as Error).message}`] };
  }
  const result = schema.safeParse(json);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, issues: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
}

async function requestJson<T>(req: JsonRequest<T>): Promise<T> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    req.log(`  · ${req.label} 요청 (${attempt}/2, ${getModel()})`);
    const message = await send(req as JsonRequest<unknown>);
    // 다음 요청에 쓸 수 있게 응답을 그대로 대화에 붙인다
    req.messages.push({ role: "assistant", content: message.content as ContentBlockParam[] });

    let issues: string[];
    if (message.stop_reason === "max_tokens") {
      issues = ["응답이 max_tokens에서 잘렸습니다"];
    } else {
      const result = validate(textOf(message), req.schema);
      if (result.ok) return result.data;
      issues = result.issues;
    }

    req.log(`  · 검증 실패: ${issues.slice(0, 5).join(" / ")}`);
    if (attempt === 2) throw new Error(`[${req.label}] 2회 시도 후에도 검증에 실패했습니다:\n- ${issues.join("\n- ")}`);
    req.messages.push({
      role: "user",
      content: `방금 출력한 JSON이 검증을 통과하지 못했어:\n- ${issues.join("\n- ")}\n\n문제를 고친 전체 JSON을 다시 출력해줘.`,
    });
  }
  throw new Error("unreachable");
}

// ---------------------------------------------------------------------------
// 3-1. 레퍼런스 분석
// ---------------------------------------------------------------------------

const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};
export const SUPPORTED_IMAGE_EXTS = Object.keys(IMAGE_TYPES);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REFERENCE_IMAGES = 10;

export type ReferenceImage = { name: string; data: Buffer };

export async function analyzeReference(images: ReferenceImage[], opts: { log?: Logger } = {}): Promise<Analysis> {
  const log = opts.log ?? silent;
  if (images.length === 0) throw new Error("레퍼런스 이미지가 없습니다");
  if (images.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`레퍼런스 이미지는 최대 ${MAX_REFERENCE_IMAGES}장입니다 (현재 ${images.length}장)`);
  }

  const content: ContentBlockParam[] = [];
  images.forEach((img, i) => {
    const mediaType = IMAGE_TYPES[path.extname(img.name).toLowerCase()];
    if (!mediaType) throw new Error(`지원하지 않는 이미지 형식: ${img.name} (${SUPPORTED_IMAGE_EXTS.join(", ")})`);
    if (img.data.length > MAX_IMAGE_BYTES) {
      throw new Error(`이미지가 5MB를 넘습니다: ${img.name} — JPG로 저장하거나 크기를 줄여 주세요`);
    }
    content.push({ type: "text", text: `[슬라이드 ${i + 1}]` });
    content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: img.data.toString("base64") } });
  });
  content.push({ type: "text", text: await loadPrompt("analyze.md") });

  return requestJson({
    label: "레퍼런스 분석",
    system: await loadPrompt("system.md"),
    messages: [{ role: "user", content }],
    schema: AnalysisSchema,
    structure: AnalysisSchema,
    effort: "medium",
    log,
  });
}

// ---------------------------------------------------------------------------
// 3-2. 원고 생성
// ---------------------------------------------------------------------------

export type DraftInput = {
  analysis: Analysis;
  topic?: string;
  /** 사용자가 직접 써본 책·제품 목록 */
  owned?: string[];
  /** 기본값: 오늘 */
  today?: Date;
};

export type DraftResult = {
  draft: DraftOutput;
  /** 서버 겹침 점검 결과 (재생성 후에도 남은 것) */
  overlaps: Overlap[];
  regenerated: boolean;
};

export async function buildDraftPrompt(input: DraftInput): Promise<string> {
  const today = input.today ?? new Date();
  const template = await loadPrompt("draft.md");
  const values: Record<string, string> = {
    today: `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`,
    topic: input.topic?.trim() || "(없음 — 레퍼런스와 계절에 맞게 정해줘)",
    owned: input.owned?.length ? input.owned.map((s) => `\n  - ${s}`).join("") : "(없음)",
    analysis: JSON.stringify(input.analysis, null, 2),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key] ?? "");
}

function draftOverlaps(draft: DraftOutput, analysis: Analysis): Overlap[] {
  return findOverlaps(
    draft.items.map((i) => i.head),
    analysis.items_to_avoid,
  );
}

export async function generateDraft(input: DraftInput, opts: { log?: Logger } = {}): Promise<DraftResult> {
  const log = opts.log ?? silent;
  const req: JsonRequest<DraftOutput> = {
    label: "원고 생성",
    system: await loadPrompt("system.md"),
    messages: [{ role: "user", content: await buildDraftPrompt(input) }],
    schema: DraftOutputSchema,
    structure: DraftOutputBase,
    effort: "high",
    log,
  };

  let draft = await requestJson(req);
  let overlaps = draftOverlaps(draft, input.analysis);
  let regenerated = false;

  // 모델 자체 점검(self_check) 또는 서버 점검에서 겹침 → 1회 재생성
  if (draft.self_check.overlap_with_reference || overlaps.length > 0) {
    const reasons = [
      ...(draft.self_check.overlap_with_reference ? [`self_check: ${draft.self_check.notes}`] : []),
      ...overlaps.map((o) => `"${o.head}" ↔ 레퍼런스 "${o.reference}" (유사도 ${o.score})`),
    ];
    log(`  · 레퍼런스와 겹침 발견 → 재생성: ${reasons.join(" / ")}`);
    req.messages.push({
      role: "user",
      content:
        `레퍼런스와 겹치는 부분이 있어:\n- ${reasons.join("\n- ")}\n\n` +
        `겹치는 항목은 레퍼런스와 다른 내용으로 새로 쓰고, 나머지 규칙은 그대로 지켜서 전체 JSON을 다시 출력해줘.`,
    });
    draft = await requestJson({ ...req, label: "원고 재생성" });
    overlaps = draftOverlaps(draft, input.analysis);
    regenerated = true;
  }

  return { draft, overlaps, regenerated };
}

export { RefusalError };

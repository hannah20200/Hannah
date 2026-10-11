import { z } from "zod";

/**
 * 원고 JSON 스키마 (SPEC 3-2).
 * LLM 출력은 photo 필드 없이 오고, 사진 매칭(3단계) 후 photo/collage가 채워진다.
 */

export const PhotoSchema = z.object({
  /** 이미지 경로. 원고 JSON 파일 기준 상대경로, 절대경로, 또는 http(s) URL */
  src: z.string().min(1),
  /** 크레딧. 예: "작가명 / Unsplash" → 렌더 시 "photo | 작가명 / Unsplash" */
  credit: z.string().min(1),
  /** 이하 3단계 사진 매칭에서 채움 (출처 표기·라이선스 확인용) */
  source: z.enum(["unsplash", "pexels", "upload", "placeholder"]).optional(),
  /** 사진 페이지 URL */
  page: z.string().optional(),
  /** 작가 페이지 URL */
  author_link: z.string().optional(),
});
export type Photo = z.infer<typeof PhotoSchema>;

const lines = (min: number, max: number) => z.array(z.string().min(1)).min(min).max(max);

export const CoverSchema = z.object({
  variant: z.enum(["A", "B"]),
  /** 표지 상단 한 줄 (없어도 됨 — 표지는 짧을수록 좋다) */
  top_line: z.string().optional(),
  title: lines(1, 2),
  sub: z.string().min(1),
  photo_query: z.string().min(1),
  photo: PhotoSchema.optional(),
  /** 표지 콜라주용 작은 사진 0~2장 */
  collage: z.array(PhotoSchema).max(2).optional(),
});
export type Cover = z.infer<typeof CoverSchema>;

export const IntroSchema = z.object({
  body: lines(2, 3),
  key: lines(1, 2),
  photo_query: z.string().min(1),
  photo: PhotoSchema.optional(),
});
export type Intro = z.infer<typeof IntroSchema>;

/** 계정 전체의 카테고리. 게시물 하나가 하나에 속하거나(또는 없음), 항목마다 붙이지 않는다 */
export const CategorySchema = z.enum(["READ", "BUY", "WEAR"]);
export type Category = z.infer<typeof CategorySchema>;

export const ItemSchema = z.object({
  head: z.string().min(1),
  body: lines(1, 3),
  key: lines(1, 1),
  pick: z.string().regex(/^PICK\s*·\s*\S/, "pick은 'PICK · 구체적 선택지' 형식이어야 합니다"),
  photo_query: z.string().min(1),
  photo: PhotoSchema.optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const EndSchema = z.object({
  lines: lines(1, 2),
  cta: z.string().min(1),
  photo_query: z.string().optional(),
  photo: PhotoSchema.optional(),
});
export type End = z.infer<typeof EndSchema>;

export const ITEMS_MIN = 3;
export const ITEMS_MAX = 8;
/** Instagram 캐러셀 최대 장수 (게시할 때 표지는 A/B 중 1장) */
export const CAROUSEL_MAX = 10;

const draftShape = {
  /** 이 게시물이 속한 계정 카테고리 (없으면 비움) */
  category: CategorySchema.optional(),
  covers: z.array(CoverSchema).length(2),
  intro: z.array(IntroSchema).max(1),
  /** 항목 수는 레퍼런스 구성에 맞춰 자유롭게 (캐러셀 10장 한도는 checkDraft에서) */
  items: z.array(ItemSchema).min(ITEMS_MIN).max(ITEMS_MAX),
  end: EndSchema,
  caption: z.string().min(1),
  hashtags: z.array(z.string().regex(/^#\S+$/)).min(1),
  self_check: z.object({
    overlap_with_reference: z.boolean(),
    notes: z.string(),
  }),
};

function checkDraft(d: { covers: { variant: string }[]; intro: unknown[]; items: unknown[] }, ctx: z.RefinementCtx) {
  const variants = d.covers.map((c) => c.variant).sort().join("");
  if (variants !== "AB") {
    ctx.addIssue({ code: "custom", path: ["covers"], message: "표지는 A/B 두 버전이어야 합니다" });
  }
  const slides = 1 + d.intro.length + d.items.length + 1;
  if (slides > CAROUSEL_MAX) {
    ctx.addIssue({
      code: "custom",
      path: ["items"],
      message: `표지 1 + 도입 ${d.intro.length} + 항목 ${d.items.length} + 마무리 1 = ${slides}장으로 캐러셀 ${CAROUSEL_MAX}장을 넘습니다`,
    });
  }
}

/** 렌더링용 원고 (사진 포함 가능) */
export const DraftSchema = z.object(draftShape).superRefine(checkDraft);
export type Draft = z.infer<typeof DraftSchema>;

/**
 * LLM이 생성하는 원고 (사진 필드 없음).
 * DraftOutputBase는 구조화 출력(JSON schema)용, DraftOutputSchema는 규칙까지 검증.
 */
export const DraftOutputBase = z.object({
  ...draftShape,
  covers: z.array(CoverSchema.omit({ photo: true, collage: true })).length(2),
  intro: z.array(IntroSchema.omit({ photo: true })).max(1),
  items: z.array(ItemSchema.omit({ photo: true })).min(ITEMS_MIN).max(ITEMS_MAX),
  end: EndSchema.omit({ photo: true }).extend({ photo_query: z.string().min(1) }),
});
export const DraftOutputSchema = DraftOutputBase.superRefine(checkDraft);
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

/** 레퍼런스 분석 결과 (SPEC 3-1) */
export const AnalysisSchema = z.object({
  slides: z.array(
    z.object({
      index: z.number().int(),
      role: z.enum(["cover", "intro", "item", "end"]),
      text: z.string(),
      visual: z.string(),
    }),
  ),
  theme: z.string(),
  tone: z.string(),
  visual_style: z.string(),
  strengths: z.array(z.string()),
  /** 레퍼런스 항목 제목들 — 새 원고에서 겹치면 안 됨 */
  items_to_avoid: z.array(z.string()),
  /** 레퍼런스의 결론/에디터 코멘트 요약 — 같은 결론을 내지 않기 위해 */
  conclusion: z.string(),
  /** 우리 계정이 다르게 갈 지점 (분석 카드의 "차별점") */
  differentiation: z.array(z.string()),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

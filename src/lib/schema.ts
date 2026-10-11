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
});
export type Photo = z.infer<typeof PhotoSchema>;

const lines = (min: number, max: number) => z.array(z.string().min(1)).min(min).max(max);

export const CoverSchema = z.object({
  variant: z.enum(["A", "B"]),
  top_line: z.string().min(1),
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

export const PillarSchema = z.enum(["READ", "BUY", "WEAR"]);
export type Pillar = z.infer<typeof PillarSchema>;

export const ItemSchema = z.object({
  pillar: PillarSchema,
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

export const DraftSchema = z
  .object({
    covers: z.array(CoverSchema).length(2),
    intro: z.array(IntroSchema).min(1),
    items: z.array(ItemSchema).length(6),
    end: EndSchema,
    caption: z.string().min(1),
    hashtags: z.array(z.string().regex(/^#\S+$/)).min(1),
    self_check: z.object({
      overlap_with_reference: z.boolean(),
      notes: z.string(),
    }),
  })
  .superRefine((d, ctx) => {
    const variants = d.covers.map((c) => c.variant).sort().join("");
    if (variants !== "AB") {
      ctx.addIssue({ code: "custom", path: ["covers"], message: "표지는 A/B 두 버전이어야 합니다" });
    }
    for (const p of PillarSchema.options) {
      const n = d.items.filter((i) => i.pillar === p).length;
      if (n !== 2) {
        ctx.addIssue({ code: "custom", path: ["items"], message: `${p} 항목은 2개여야 합니다 (현재 ${n}개)` });
      }
    }
  });
export type Draft = z.infer<typeof DraftSchema>;

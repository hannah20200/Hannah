import { fileUrl, handle } from "@/lib/api";
import { listPostIds, listRendered, readDraft, readIdeas, readMeta, readPublish, type PublishState } from "@/lib/store";

export type BoardCard = {
  id: string;
  title: string;
  topic?: string;
  created_at: string;
  stage: "writing" | "ready" | "scheduled" | "publishing" | "published" | "failed";
  thumb?: string;
  publish: PublishState | null;
  slideCount: number;
};

/** GET /api/board → 콘텐츠 보드 (게시물 카드 + 아이디어) */
export async function GET() {
  return handle(async () => {
    const cards: BoardCard[] = [];
    for (const id of await listPostIds()) {
      try {
        const meta = await readMeta(id);
        const draft = await readDraft(id).catch(() => undefined);
        const rendered = await listRendered(id);
        const publish = (await readPublish(id).catch(() => undefined)) ?? null;
        const cover = publish?.cover ?? "A";
        const coverPng = rendered.find((f) => f.startsWith(`00_표지${cover}`));
        const coverPhoto = draft?.covers.find((c) => c.variant === cover)?.photo?.src;
        cards.push({
          id,
          title: draft?.covers.find((c) => c.variant === cover)?.title.join(" ") ?? meta.topic ?? "(분석 전)",
          topic: meta.topic,
          created_at: meta.created_at,
          stage: publish ? publish.status : rendered.length ? "ready" : "writing",
          thumb: coverPng
            ? fileUrl(id, "out", coverPng, publish?.updated_at ?? meta.created_at)
            : coverPhoto && !/^https?:/.test(coverPhoto)
              ? fileUrl(id, "work", coverPhoto)
              : coverPhoto,
          publish,
          slideCount: rendered.length,
        });
      } catch {
        // 깨진 게시물은 건너뜀
      }
    }
    cards.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { cards, ideas: await readIdeas() };
  });
}

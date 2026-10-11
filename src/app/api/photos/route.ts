import { searchPhotos } from "@/lib/photos";

/** GET /api/photos?q=검색어 → 후보 6장 (작가명/링크 포함) */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim();
  if (!q) return Response.json({ error: "q(검색어)가 필요합니다" }, { status: 400 });
  try {
    const { candidates, excluded } = await searchPhotos(q);
    return Response.json({ query: q, candidates, excluded: excluded.length });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { emptyState, listSlots } from "../src/lib/photo-plan";
import { matchPhotos } from "../src/lib/photo-match";
import { exclusionReason, luminance, searchPhotos, type Candidate, type FetchLike } from "../src/lib/photos";
import { DraftSchema, type Draft } from "../src/lib/schema";

// --- 가짜 API ------------------------------------------------------------

type U = Partial<{ id: string; width: number; height: number; color: string; description: string; sponsorship: object; premium: boolean }>;

function unsplashResult(o: U & { id: string }) {
  return {
    id: o.id,
    width: o.width ?? 2000,
    height: o.height ?? 3000,
    color: o.color ?? "#d9c8b0",
    description: o.description ?? "woman reading",
    alt_description: null,
    urls: { raw: `https://images.unsplash.com/${o.id}?ixid=x`, small: `https://images.unsplash.com/${o.id}?w=400` },
    links: { html: `https://unsplash.com/photos/${o.id}`, download_location: `https://api.unsplash.com/photos/${o.id}/download` },
    user: { name: `Author ${o.id}`, links: { html: `https://unsplash.com/@a${o.id}` } },
    sponsorship: o.sponsorship ?? null,
    premium: o.premium ?? false,
  };
}

function pexelsPhoto(id: number) {
  return {
    id,
    width: 3000,
    height: 4500,
    url: `https://www.pexels.com/photo/${id}/`,
    alt: "coffee on a table",
    avg_color: "#C8B8A0",
    photographer: `Pexels ${id}`,
    photographer_url: `https://www.pexels.com/@p${id}`,
    src: { original: `https://images.pexels.com/photos/${id}/a.jpeg`, medium: `https://images.pexels.com/photos/${id}/m.jpeg` },
  };
}

function fakeFetch(opts: {
  unsplash?: (q: string) => ReturnType<typeof unsplashResult>[] | number;
  pexels?: (q: string) => ReturnType<typeof pexelsPhoto>[] | number;
}) {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const u = new URL(url);
    if (u.host === "api.unsplash.com" && u.pathname === "/search/photos") {
      const r = opts.unsplash?.(u.searchParams.get("query")!) ?? [];
      return typeof r === "number" ? new Response("err", { status: r }) : Response.json({ results: r });
    }
    if (u.host === "api.pexels.com") {
      const r = opts.pexels?.(u.searchParams.get("query")!) ?? [];
      return typeof r === "number" ? new Response("err", { status: r }) : Response.json({ photos: r });
    }
    if (u.pathname.endsWith("/download")) return Response.json({ url: "x" });
    // 이미지
    return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "content-type": "image/jpeg" } });
  };
  return { fn, calls };
}

// 첫 단어가 같은 검색어끼리 결과가 겹치는 상황 (실제 API와 비슷): 12장
const manyUnsplash = (q: string) =>
  Array.from({ length: 12 }, (_, i) => unsplashResult({ id: `${q.split(" ")[0]}${i}` }));

function sampleDraft(): Draft {
  const d = JSON.parse(readFileSync("samples/taste_check.json", "utf8"));
  for (const c of d.covers) delete c.photo, delete c.collage;
  for (const s of [...d.intro, ...d.items, d.end]) delete s.photo;
  return DraftSchema.parse(d);
}

const keys = { unsplash: "UK", pexels: "PK" };

// --- 검색 ------------------------------------------------------------------

describe("searchPhotos", () => {
  it("제외 규칙 + 세로·밝은 사진 우선 정렬, 6장", async () => {
    const { fn } = fakeFetch({
      unsplash: () => [
        unsplashResult({ id: "land", width: 3000, height: 2000 }), // 가로
        unsplashResult({ id: "ad", sponsorship: { tagline: "ad" } }),
        unsplashResult({ id: "small", width: 500, height: 800 }),
        unsplashResult({ id: "quote", description: "motivational quote on wall" }),
        unsplashResult({ id: "plus", premium: true }),
        unsplashResult({ id: "dark", color: "#101010" }),
        unsplashResult({ id: "p1" }),
        unsplashResult({ id: "p2" }),
        unsplashResult({ id: "p3" }),
        unsplashResult({ id: "p4" }),
        unsplashResult({ id: "p5" }),
      ],
    });
    const r = await searchPhotos("woman reading", { keys: { unsplash: "UK" }, fetch: fn });
    assert.deepEqual(
      r.candidates.map((c) => c.id),
      ["p1", "p2", "p3", "p4", "p5", "land"],
    );
    assert.equal(r.excluded.length, 4);
    assert.ok(!r.candidates.some((c) => c.id === "dark"), "어두운 사진은 뒤로 밀림");
  });

  it("Unsplash가 모자라면 Pexels로 채움", async () => {
    const { fn, calls } = fakeFetch({
      unsplash: () => [unsplashResult({ id: "u1" }), unsplashResult({ id: "u2" })],
      pexels: () => [pexelsPhoto(1), pexelsPhoto(2), pexelsPhoto(3), pexelsPhoto(4), pexelsPhoto(5)],
    });
    const r = await searchPhotos("coffee", { keys, fetch: fn });
    assert.deepEqual(
      r.candidates.map((c) => c.key),
      ["unsplash:u1", "unsplash:u2", "pexels:1", "pexels:2", "pexels:3", "pexels:4"],
    );
    assert.equal(calls[0].headers?.Authorization, "Client-ID UK");
    assert.equal(calls[1].headers?.Authorization, "PK");
    assert.match(calls[0].url, /orientation=portrait/);
    assert.match(calls[0].url, /content_filter=high/);
  });

  it("Unsplash가 충분하면 Pexels는 호출하지 않음", async () => {
    const { fn, calls } = fakeFetch({ unsplash: manyUnsplash });
    await searchPhotos("coffee", { keys, fetch: fn });
    assert.equal(calls.length, 1);
  });

  it("Unsplash 오류여도 Pexels로 진행, 둘 다 실패하면 에러", async () => {
    const ok = fakeFetch({ unsplash: () => 401, pexels: () => [pexelsPhoto(9)] });
    assert.equal((await searchPhotos("x", { keys, fetch: ok.fn })).candidates[0].key, "pexels:9");
    const bad = fakeFetch({ unsplash: () => 401, pexels: () => 500 });
    await assert.rejects(searchPhotos("x", { keys, fetch: bad.fn }), /Unsplash 검색 실패: HTTP 401 \(API 키를 확인/);
  });

  it("키가 하나도 없으면 에러", async () => {
    await assert.rejects(searchPhotos("x", { keys: {} }), /사진 API 키가 없습니다/);
  });

  it("제외 단어는 단어 단위로만 (texture는 통과, neon sign은 제외)", () => {
    const base = { width: 2000, height: 3000 } as Candidate;
    assert.equal(exclusionReason({ ...base, description: "linen texture" }), null);
    assert.match(exclusionReason({ ...base, description: "a neon sign at night" })!, /neon sign/);
    assert.match(exclusionReason({ ...base, description: "AI-generated portrait" })!, /AI-generated/i);
    assert.equal(luminance("#ffffff"), 1);
  });
});

// --- 원고 전체 매칭 -----------------------------------------------------------

describe("matchPhotos", () => {
  it("모든 자리에 중복 없이 배정 + 크레딧 + 내려받기", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "photos-"));
    const draft = sampleDraft();
    const state = emptyState();
    const { fn, calls } = fakeFetch({ unsplash: manyUnsplash });

    const r = await matchPhotos({ draft, draftDir: dir, state, keys, fetch: fn });
    assert.deepEqual(r.empty, []);

    const all = [
      ...draft.covers.flatMap((c) => [c.photo, ...(c.collage ?? [])]),
      ...draft.intro.map((s) => s.photo),
      ...draft.items.map((s) => s.photo),
      draft.end.photo,
    ];
    assert.equal(all.length, listSlots(draft).length);
    assert.ok(all.every(Boolean));
    assert.equal(new Set(all.map((p) => p!.src)).size, all.length, "게시물 안에서 같은 사진 중복 없음");
    assert.notEqual(draft.covers[0].photo!.src, draft.covers[1].photo!.src, "표지 A/B 사진 다름");
    assert.match(draft.items[0].photo!.credit, /^Author .+ \/ Unsplash$/);
    assert.match(draft.items[0].photo!.page!, /utm_source=small_magazine_maker/);
    assert.ok(existsSync(path.join(dir, draft.items[0].photo!.src)));

    // 사용할 때마다 download_location 1회
    const downloads = calls.filter((c) => c.url.endsWith("/download"));
    assert.equal(downloads.length, all.length);
    // 결과는 그대로 렌더링 스키마를 통과
    assert.ok(DraftSchema.safeParse(draft).success);
  });

  it("다시 실행하면 검색·다운로드 없이 유지, --pick/--file 반영, 검색어가 바뀐 자리만 재검색", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "photos-"));
    const draft = sampleDraft();
    const state = emptyState();
    await matchPhotos({ draft, draftDir: dir, state, keys, fetch: fakeFetch({ unsplash: manyUnsplash }).fn });
    const before = draft.items[2].photo!.src;

    // 같은 상태로 다시: 네트워크 호출 0
    const again = fakeFetch({ unsplash: manyUnsplash });
    await matchPhotos({ draft, draftDir: dir, state, keys, fetch: again.fn });
    assert.equal(again.calls.length, 0);
    assert.equal(draft.items[2].photo!.src, before);

    // item.3을 후보 5번으로, item.4는 직접 올린 사진으로
    const mine = path.join(dir, "mine.jpg");
    writeFileSync(mine, "jpg");
    const third = fakeFetch({ unsplash: manyUnsplash });
    await matchPhotos({
      draft,
      draftDir: dir,
      state,
      keys,
      fetch: third.fn,
      picks: { "item.3": 5 },
      files: { "item.4": { path: mine, credit: "본인 촬영" } },
    });
    const q3 = state.slots["item.3"].query;
    assert.equal(state.slots["item.3"].pick, state.queries[q3].candidates[4].key);
    assert.notEqual(draft.items[2].photo!.src, before);
    assert.deepEqual(draft.items[3].photo, { src: "photos/upload-item_4.jpg", credit: "본인 촬영", source: "upload" });

    // 검색어 변경 → 그 자리만 다시 검색
    draft.items[0].photo_query = "brand new query";
    const fourth = fakeFetch({ unsplash: manyUnsplash });
    await matchPhotos({ draft, draftDir: dir, state, keys, fetch: fourth.fn });
    const searches = fourth.calls.filter((c) => c.url.includes("/search/photos"));
    assert.equal(searches.length, 1);
    assert.match(searches[0].url, /brand\+new\+query/);
    assert.match(draft.items[0].photo!.src, /unsplash-brand/);
  });

  it("없는 자리·번호는 에러", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "photos-"));
    const { fn } = fakeFetch({ unsplash: manyUnsplash });
    await assert.rejects(
      matchPhotos({ draft: sampleDraft(), draftDir: dir, state: emptyState(), keys, fetch: fn, picks: { "item.9": 1 } }),
      /없는 자리: item\.9/,
    );
    await assert.rejects(
      matchPhotos({ draft: sampleDraft(), draftDir: dir, state: emptyState(), keys, fetch: fn, picks: { "item.1": 11 } }),
      /후보 11번이 없습니다/,
    );
  });

  it("후보가 모자라면 빈 자리로 보고", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "photos-"));
    const draft = sampleDraft();
    const one = (q: string) => [unsplashResult({ id: `${q.split(" ")[0]}0` })];
    const r = await matchPhotos({ draft, draftDir: dir, state: emptyState(), keys: { unsplash: "UK" }, fetch: fakeFetch({ unsplash: one }).fn });
    // 표지 콜라주는 표지와 같은 검색어 → 후보 1장이면 콜라주 자리는 비어야 함
    assert.ok(r.empty.includes("cover.A.collage1"));
    assert.equal(draft.covers[0].collage?.length ?? 0, 0);
  });
});

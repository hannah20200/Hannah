import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// 임시 프로젝트 루트 (paths.ts가 import 시점에 읽으므로 먼저 설정) — 테스트 파일은 각자 별도 프로세스
const ROOT = mkdtempSync(path.join(tmpdir(), "publish-"));
process.env.PROJECT_ROOT = ROOT;
cpSync("samples", path.join(ROOT, "samples"), { recursive: true });

const { buildCaption, publishCarousel } = await import("../src/lib/instagram");
const { carouselFiles, publishPost, runDue, schedulePost } = await import("../src/lib/publish");
const { createPost, readPublish, writeDraft } = await import("../src/lib/store");
const { DraftSchema } = await import("../src/lib/schema");

const config = { token: "TOKEN", userId: "IGUSER", host: "graph.instagram.com", version: "v26.0", publicBaseUrl: "https://pub.example" };
const RENDERED = ["00_표지A.png", "00_표지B.png", "01_도입.png", ...[1, 2, 3, 4, 5, 6].map((n) => `${String(n + 1).padStart(2, "0")}_항목${n}.png`), "08_마무리.png"];

/** 가짜 Graph API: 요청을 기록하고 순서대로 id를 돌려준다 */
function fakeGraph(opts: { failOn?: string; statuses?: string[] } = {}) {
  const calls: { method: string; url: string; params: Record<string, string> }[] = [];
  const statuses = [...(opts.statuses ?? ["IN_PROGRESS", "FINISHED"])];
  let n = 0;
  const fetch = async (url: string, init?: { method?: string; body?: URLSearchParams }) => {
    const u = new URL(url);
    const params = Object.fromEntries(init?.body ?? u.searchParams);
    calls.push({ method: init?.method ?? "GET", url: u.pathname, params });
    if (opts.failOn && u.pathname.endsWith(opts.failOn)) {
      return Response.json({ error: { message: "Invalid OAuth access token", code: 190 } }, { status: 400 });
    }
    if (u.pathname.endsWith("/media") || u.pathname.endsWith("/media_publish")) return Response.json({ id: `c${++n}` });
    if (params.fields === "status_code,status") return Response.json({ status_code: statuses.shift() ?? "FINISHED" });
    if (params.fields === "permalink") return Response.json({ permalink: "https://www.instagram.com/p/XYZ/" });
    return Response.json({});
  };
  return { fetch, calls };
}

async function makePost(rendered = RENDERED) {
  const meta = await createPost({ refs: [] });
  const draft = DraftSchema.parse(JSON.parse(readFileSync("samples/taste_check.json", "utf8")));
  await writeDraft(meta.id, draft);
  mkdirSync(path.join(ROOT, "out", meta.id), { recursive: true });
  for (const f of rendered) writeFileSync(path.join(ROOT, "out", meta.id, f), "png");
  return meta.id;
}

// PNG→JPEG 변환 대신: 파일 이름만 만들어 준다
const fakeConvert = async (pngs: string[], outDir: string) => {
  mkdirSync(outDir, { recursive: true });
  return pngs.map((_, i) => {
    const f = path.join(outDir, `${String(i + 1).padStart(2, "0")}.jpg`);
    writeFileSync(f, "jpg");
    return f;
  });
};
const noSleep = async () => {};

describe("instagram", () => {
  it("캡션 + 해시태그, 길이·개수 확인", () => {
    assert.deepEqual(buildCaption("안녕", ["#a", "#b"]), { text: "안녕\n\n#a #b", problems: [] });
    assert.match(buildCaption("x".repeat(2300), []).problems[0], /2200자/);
    assert.match(buildCaption("c", Array.from({ length: 31 }, (_, i) => `#t${i}`)).problems[0], /30개/);
  });

  it("캐러셀 게시 순서: 항목 컨테이너 → CAROUSEL → 상태 확인 → media_publish", async () => {
    const g = fakeGraph();
    const r = await publishCarousel({ imageUrls: ["https://a/1.jpg", "https://a/2.jpg"], caption: "캡션" }, config, { fetch: g.fetch, sleep: noSleep });
    assert.equal(r.mediaId, "c4");
    assert.equal(r.permalink, "https://www.instagram.com/p/XYZ/");
    const [i1, i2, car, st1, st2, pub] = g.calls;
    assert.equal(i1.url, "/v26.0/IGUSER/media");
    assert.deepEqual(i1.params, { image_url: "https://a/1.jpg", is_carousel_item: "true", access_token: "TOKEN" });
    assert.equal(i2.params.image_url, "https://a/2.jpg");
    assert.deepEqual(car.params, { media_type: "CAROUSEL", children: "c1,c2", caption: "캡션", access_token: "TOKEN" });
    assert.equal(st1.url, "/v26.0/c3");
    assert.equal(st2.method, "GET");
    assert.deepEqual(pub.params, { creation_id: "c3", access_token: "TOKEN" });
  });

  it("컨테이너 ERROR면 게시하지 않는다", async () => {
    const g = fakeGraph({ statuses: ["ERROR"] });
    await assert.rejects(
      publishCarousel({ imageUrls: ["https://a/1.jpg", "https://a/2.jpg"], caption: "c" }, config, { fetch: g.fetch, sleep: noSleep }),
      /캐러셀 준비 실패: ERROR/,
    );
    assert.ok(!g.calls.some((c) => c.url.endsWith("media_publish")));
  });

  it("토큰 오류는 알아보기 쉽게", async () => {
    const g = fakeGraph({ failOn: "/media" });
    await assert.rejects(
      publishCarousel({ imageUrls: ["https://a/1.jpg", "https://a/2.jpg"], caption: "c" }, config, { fetch: g.fetch, sleep: noSleep }),
      /Invalid OAuth access token \(토큰이 만료됐거나 잘못됐어요\)/,
    );
  });

  it("네트워크 오류도 알아보기 쉽게", async () => {
    const down = async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    };
    await assert.rejects(
      publishCarousel({ imageUrls: ["https://a/1.jpg", "https://a/2.jpg"], caption: "c" }, config, { fetch: down }),
      /graph\.instagram\.com\)에 연결하지 못했어요 \(ENOTFOUND\)/,
    );
  });

  it("1장이나 11장 이상은 거부", async () => {
    await assert.rejects(publishCarousel({ imageUrls: ["x"], caption: "c" }, config, { fetch: fakeGraph().fetch }), /2~10장/);
  });
});

describe("publish", () => {
  it("고른 표지 1장 + 나머지 8장, 다른 표지는 빠진다", () => {
    const b = carouselFiles(RENDERED, "B");
    assert.equal(b.length, 9);
    assert.equal(b[0], "00_표지B.png");
    assert.ok(!b.includes("00_표지A.png"));
    assert.equal(b.at(-1), "08_마무리.png");
  });

  it("PNG가 없으면 예약할 수 없다", async () => {
    const id = await makePost([]);
    await assert.rejects(schedulePost(id, "A", new Date()), /PNG를 먼저 만들어/);
  });

  it("예약 → 게시: 공개 URL·캡션·상태 기록", async () => {
    const id = await makePost();
    const scheduled = await schedulePost(id, "B", new Date(Date.now() + 3600_000));
    assert.equal(scheduled.status, "scheduled");
    assert.match(scheduled.token, /^[0-9a-f]{32}$/);

    const g = fakeGraph();
    const done = await publishPost(id, { config, fetch: g.fetch, convert: fakeConvert, sleep: noSleep });
    assert.equal(done.status, "published");
    assert.equal(done.permalink, "https://www.instagram.com/p/XYZ/");
    assert.equal(done.attempts, 1);

    const items = g.calls.filter((c) => c.params.is_carousel_item === "true");
    assert.equal(items.length, 9);
    assert.equal(items[0].params.image_url, `https://pub.example/api/public/${id}/${scheduled.token}/01.jpg`);
    const car = g.calls.find((c) => c.params.media_type === "CAROUSEL")!;
    assert.match(car.params.caption, /#작은매거진/);
    assert.deepEqual(await readPublish(id), done);

    // 이미 게시된 건 다시 올리지 않는다
    const again = fakeGraph();
    await publishPost(id, { config, fetch: again.fetch, convert: fakeConvert });
    assert.equal(again.calls.length, 0);
  });

  it("실패하면 failed + 에러 기록, 다시 시도 가능", async () => {
    const id = await makePost();
    await schedulePost(id, "A", new Date());
    await assert.rejects(publishPost(id, { config, fetch: fakeGraph({ failOn: "/media" }).fetch, convert: fakeConvert, sleep: noSleep }));
    const failed = await readPublish(id);
    assert.equal(failed?.status, "failed");
    assert.match(failed!.error!, /토큰/);

    const ok = await publishPost(id, { config, fetch: fakeGraph().fetch, convert: fakeConvert, sleep: noSleep });
    assert.equal(ok.status, "published");
    assert.equal(ok.attempts, 2);
  });

  it("runDue: 시간이 된 예약만 게시", async () => {
    const due = await makePost();
    const later = await makePost();
    await schedulePost(due, "A", new Date(Date.now() - 1000));
    await schedulePost(later, "A", new Date(Date.now() + 3600_000));
    const results = await runDue(new Date(), { config, fetch: fakeGraph().fetch, convert: fakeConvert, sleep: noSleep });
    assert.ok(results.some((r) => r.id === due && r.ok));
    assert.ok(!results.some((r) => r.id === later));
    assert.equal((await readPublish(later))?.status, "scheduled");
  });

  it("게시 중인 건 동시에 다시 올리지 않는다", async () => {
    const id = await makePost();
    await schedulePost(id, "A", new Date());
    const { writePublish } = await import("../src/lib/store");
    const s = (await readPublish(id))!;
    await writePublish(id, { ...s, status: "publishing", updated_at: new Date().toISOString() });
    await assert.rejects(publishPost(id, { config, fetch: fakeGraph().fetch, convert: fakeConvert }), /지금 게시하는 중/);
  });
});

/**
 * 게시 예약·실행.
 * - 예약: work/{id}/publish.json (status: scheduled)
 * - 실행: 표지 하나 + 본문 PNG → JPEG → 공개 URL → Instagram 캐러셀 게시
 * - 스케줄러(scheduler.ts)가 1분마다 runDue()로 시간이 된 예약을 게시한다
 */
import { randomBytes } from "node:crypto";
import path from "node:path";
import { buildCaption, configFromEnv, publishCarousel, type FetchLike, type InstagramConfig } from "./instagram";
import { pngsToJpegs } from "./jpeg";
import {
  listPostIds,
  listRendered,
  outDir,
  readDraft,
  readPublish,
  StoreError,
  writePublish,
  type PublishState,
} from "./store";

/** 게시 중 상태가 이보다 오래되면 멈춘 것으로 보고 다시 시도할 수 있게 한다 */
const STALE_MS = 15 * 60 * 1000;

const now = () => new Date().toISOString();

/** 게시할 PNG: 고른 표지 1장 + 나머지 (다른 표지는 뺀다) */
export function carouselFiles(rendered: string[], cover: "A" | "B"): string[] {
  const other = cover === "A" ? "B" : "A";
  const files = rendered.filter((f) => !f.startsWith(`00_표지${other}`));
  const first = files.find((f) => f.startsWith(`00_표지${cover}`));
  if (!first) throw new StoreError(400, `표지 ${cover} PNG가 없습니다. 미리보기에서 PNG를 먼저 만들어 주세요`);
  return [first, ...files.filter((f) => f !== first)];
}

/** 게시 전 확인 (예약할 때·게시할 때 공통) */
export async function checkReady(id: string, cover: "A" | "B") {
  const draft = await readDraft(id);
  if (!draft) throw new StoreError(400, "원고가 없습니다");
  const rendered = await listRendered(id);
  if (rendered.length === 0) throw new StoreError(400, "미리보기에서 PNG를 먼저 만들어 주세요");
  const files = carouselFiles(rendered, cover);
  const caption = buildCaption(draft.caption, draft.hashtags);
  if (caption.problems.length) throw new StoreError(400, caption.problems.join("\n"));
  return { files, caption: caption.text };
}

export async function schedulePost(id: string, cover: "A" | "B", at: Date): Promise<PublishState> {
  if (Number.isNaN(at.getTime())) throw new StoreError(400, "예약 시각이 올바르지 않습니다");
  await checkReady(id, cover);
  const prev = await readPublish(id);
  if (prev?.status === "published") throw new StoreError(400, "이미 게시된 게시물입니다");
  if (prev?.status === "publishing") throw new StoreError(409, "지금 게시하는 중입니다");
  const state: PublishState = {
    status: "scheduled",
    cover,
    scheduled_at: at.toISOString(),
    token: prev?.token ?? randomBytes(16).toString("hex"),
    updated_at: now(),
    attempts: 0,
  };
  await writePublish(id, state);
  return state;
}

export type PublishDeps = {
  config?: InstagramConfig;
  fetch?: FetchLike;
  convert?: typeof pngsToJpegs;
  log?: (msg: string) => void;
  sleep?: (ms: number) => Promise<void>;
};

/** 예약된(또는 실패한) 게시물을 지금 게시 */
export async function publishPost(id: string, deps: PublishDeps = {}): Promise<PublishState> {
  const log = deps.log ?? (() => {});
  const config = deps.config ?? configFromEnv().config;
  if (!config) throw new StoreError(400, `Instagram 설정이 없습니다: ${configFromEnv().missing.join(", ")}`);

  const state = await readPublish(id);
  if (!state) throw new StoreError(400, "예약 정보가 없습니다");
  if (state.status === "published") return state;
  if (state.status === "publishing" && Date.now() - Date.parse(state.updated_at) < STALE_MS) {
    throw new StoreError(409, "지금 게시하는 중입니다");
  }

  // 잠금: 다른 실행이 같은 게시물을 동시에 올리지 않게
  const { error: _previousError, ...rest } = state;
  const locked: PublishState = { ...rest, status: "publishing", updated_at: now(), attempts: state.attempts + 1 };
  await writePublish(id, locked);

  try {
    const { files, caption } = await checkReady(id, state.cover);
    log(`[${id}] JPEG 변환 ${files.length}장`);
    const jpegs = await (deps.convert ?? pngsToJpegs)(
      files.map((f) => path.join(outDir(id), f)),
      path.join(outDir(id), "ig"),
    );
    const imageUrls = jpegs.map(
      (f) => `${config.publicBaseUrl}/api/public/${encodeURIComponent(id)}/${state.token}/${path.basename(f)}`,
    );
    log(`[${id}] Instagram에 게시`);
    const result = await publishCarousel({ imageUrls, caption }, config, { fetch: deps.fetch, log, sleep: deps.sleep });
    const done: PublishState = {
      ...locked,
      status: "published",
      updated_at: now(),
      published_at: now(),
      media_id: result.mediaId,
      permalink: result.permalink,
    };
    await writePublish(id, done);
    return done;
  } catch (err) {
    const failed: PublishState = { ...locked, status: "failed", updated_at: now(), error: (err as Error).message };
    await writePublish(id, failed);
    throw err;
  }
}

/** 시간이 된 예약을 게시 (스케줄러·cron용). 실패는 다음 예약에 영향 주지 않는다 */
export async function runDue(at = new Date(), deps: PublishDeps = {}): Promise<{ id: string; ok: boolean; error?: string }[]> {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of await listPostIds()) {
    const s = await readPublish(id).catch(() => undefined);
    if (s?.status !== "scheduled" || Date.parse(s.scheduled_at) > at.getTime()) continue;
    try {
      await publishPost(id, deps);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: (err as Error).message });
    }
  }
  return results;
}

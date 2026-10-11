/**
 * 원고 전체 사진 매칭: 검색 → 자동 배정(+사용자 선택) → 내려받기 → 원고에 사진·크레딧 기록
 */
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { autoAssign, findCandidate, listSlots, setPhoto, syncSlots, type PhotoState, type Slot } from "./photo-plan";
import { creditOf, downloadPhoto, MATCH_CANDIDATE_COUNT, searchPhotos, type FetchLike, type PhotoKeys } from "./photos";
import type { Draft } from "./schema";

export type MatchOptions = {
  draft: Draft;
  /** 원고 JSON이 있는 폴더. 사진은 {draftDir}/photos/ 에 저장 */
  draftDir: string;
  state: PhotoState;
  /** 자리 → 후보 번호(1~10) */
  picks?: Record<string, number>;
  /** 자리 → 직접 올린 파일 경로 (+크레딧) */
  files?: Record<string, { path: string; credit?: string }>;
  /** 저장된 검색 결과를 버리고 다시 검색 */
  refresh?: boolean;
  keys?: PhotoKeys;
  fetch?: FetchLike;
  log?: (msg: string) => void;
};

export type MatchResult = { slots: Slot[]; empty: string[] };

export const UPLOAD_CREDIT = "직접 촬영";

export async function matchPhotos(opts: MatchOptions): Promise<MatchResult> {
  const { draft, state } = opts;
  const log = opts.log ?? (() => {});
  const photoDir = path.join(opts.draftDir, "photos");
  const slots = listSlots(draft);
  const slotNames = new Set(slots.map((s) => s.slot));
  const check = (slot: string) => {
    if (!slotNames.has(slot)) throw new Error(`없는 자리: ${slot} (가능: ${[...slotNames].join(", ")})`);
  };

  if (opts.refresh) state.queries = {};
  syncSlots(state, slots);

  // 1) 검색 (검색어별 1회, 결과는 state에 저장해 재사용)
  for (const query of new Set(slots.map((s) => s.query))) {
    if (state.queries[query]) continue;
    const { candidates, excluded } = await searchPhotos(query, { keys: opts.keys, fetch: opts.fetch, count: MATCH_CANDIDATE_COUNT });
    state.queries[query] = { candidates, excluded: excluded.length };
    log(`  · "${query}": 후보 ${candidates.length}장${excluded.length ? ` (제외 ${excluded.length}장)` : ""}`);
  }

  // 2) 사용자 선택
  for (const [slot, n] of Object.entries(opts.picks ?? {})) {
    check(slot);
    const st = state.slots[slot];
    const cand = state.queries[st.query]?.candidates[n - 1];
    if (!cand) throw new Error(`${slot}: 후보 ${n}번이 없습니다 (후보 ${state.queries[st.query]?.candidates.length ?? 0}장)`);
    state.slots[slot] = { query: st.query, pick: cand.key };
  }
  for (const [slot, f] of Object.entries(opts.files ?? {})) {
    check(slot);
    if (!existsSync(f.path)) throw new Error(`${slot}: 파일이 없습니다: ${f.path}`);
    await mkdir(photoDir, { recursive: true });
    const name = `upload-${slot.replace(/\./g, "_")}${path.extname(f.path).toLowerCase() || ".jpg"}`;
    await copyFile(f.path, path.join(photoDir, name));
    state.slots[slot] = { query: state.slots[slot].query, file: name, credit: f.credit?.trim() || UPLOAD_CREDIT };
  }

  // 3) 나머지 자동 배정 (게시물 안에서 중복 없이)
  const empty = autoAssign(state, slots);

  // 4) 내려받기 + 원고에 기록
  for (const s of slots) {
    const st = state.slots[s.slot];
    if (st.file) {
      setPhoto(draft, s.slot, { src: `photos/${st.file}`, credit: st.credit ?? UPLOAD_CREDIT, source: "upload" });
      continue;
    }
    const cand = st.pick ? findCandidate(state, st.pick) : undefined;
    if (!cand) {
      setPhoto(draft, s.slot, undefined);
      continue;
    }
    let file = state.downloaded[cand.key];
    if (!file || !existsSync(path.join(photoDir, file))) {
      file = await downloadPhoto(cand, photoDir, { keys: opts.keys, fetch: opts.fetch });
      state.downloaded[cand.key] = file;
    }
    setPhoto(draft, s.slot, {
      src: `photos/${file}`,
      credit: creditOf(cand),
      source: cand.source,
      page: cand.page,
      author_link: cand.authorLink,
    });
  }

  return { slots, empty };
}

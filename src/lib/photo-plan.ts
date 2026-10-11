/**
 * 원고의 사진 자리(slot)와 사진 선택 상태.
 * slot 이름: cover.A, cover.A.collage1, cover.A.collage2, cover.B…, intro.1, item.1~6, end
 */
import type { Candidate } from "./photos";
import type { Draft, Photo } from "./schema";

export type Slot = { slot: string; query: string; label: string };

export function listSlots(draft: Draft): Slot[] {
  const slots: Slot[] = [];
  const covers = [...draft.covers].sort((a, b) => a.variant.localeCompare(b.variant));
  for (const c of covers) {
    slots.push({ slot: `cover.${c.variant}`, query: c.photo_query, label: `표지${c.variant}` });
    for (const n of [1, 2]) {
      slots.push({ slot: `cover.${c.variant}.collage${n}`, query: c.photo_query, label: `표지${c.variant} 콜라주${n}` });
    }
  }
  draft.intro.forEach((s, i) => slots.push({ slot: `intro.${i + 1}`, query: s.photo_query, label: `도입${i + 1}` }));
  draft.items.forEach((s, i) => slots.push({ slot: `item.${i + 1}`, query: s.photo_query, label: `항목${i + 1}` }));
  // 마무리 검색어가 없으면 표지A 검색어를 쓴다
  slots.push({ slot: "end", query: draft.end.photo_query || covers[0].photo_query, label: "마무리" });
  return slots;
}

export function setPhoto(draft: Draft, slot: string, photo: Photo | undefined): void {
  const [kind, a, b] = slot.split(".");
  if (kind === "cover") {
    const cover = draft.covers.find((c) => c.variant === a);
    if (!cover) throw new Error(`없는 표지: ${slot}`);
    if (!b) cover.photo = photo;
    else {
      const idx = Number(b.replace("collage", "")) - 1;
      const collage = [...(cover.collage ?? [])];
      if (photo) collage[idx] = photo;
      else collage.splice(idx, 1);
      cover.collage = collage.filter(Boolean);
    }
  } else if (kind === "intro" || kind === "item") {
    const list = kind === "intro" ? draft.intro : draft.items;
    const target = list[Number(a) - 1];
    if (!target) throw new Error(`없는 자리: ${slot}`);
    target.photo = photo;
  } else if (kind === "end") {
    draft.end.photo = photo;
  } else {
    throw new Error(`알 수 없는 자리: ${slot}`);
  }
}

// ---------------------------------------------------------------------------
// 선택 상태 (work/{id}/photos.json)
// ---------------------------------------------------------------------------

export type SlotState = {
  query: string;
  /** 고른 후보의 key (예: "unsplash:abc") */
  pick?: string;
  /** 직접 올린 사진 (photos/ 안의 파일 이름) */
  file?: string;
  /** 직접 올린 사진의 크레딧 */
  credit?: string;
};

export type PhotoState = {
  queries: Record<string, { candidates: Candidate[]; excluded: number }>;
  slots: Record<string, SlotState>;
  /** 후보 key → 내려받은 파일 이름 */
  downloaded: Record<string, string>;
};

export const emptyState = (): PhotoState => ({ queries: {}, slots: {}, downloaded: {} });

/** 검색어가 바뀐 자리는 선택을 초기화한다 */
export function syncSlots(state: PhotoState, slots: Slot[]): void {
  const next: Record<string, SlotState> = {};
  for (const s of slots) {
    const prev = state.slots[s.slot];
    next[s.slot] = prev && (prev.query === s.query || prev.file) ? { ...prev, query: s.query } : { query: s.query };
  }
  state.slots = next;
}

/**
 * 고르지 않은 자리에 후보를 자동 배정한다.
 * 한 게시물 안에서는 같은 사진을 두 번 쓰지 않는다 (표지 A/B도 서로 다른 사진).
 * 반환: 후보가 모자라 비어 있는 자리
 */
export function autoAssign(state: PhotoState, slots: Slot[]): string[] {
  const used = new Set(Object.values(state.slots).map((s) => s.pick).filter(Boolean) as string[]);
  const empty: string[] = [];
  for (const s of slots) {
    const st = state.slots[s.slot];
    if (st.pick || st.file) continue;
    const cand = state.queries[s.query]?.candidates.find((c) => !used.has(c.key));
    if (cand) {
      st.pick = cand.key;
      used.add(cand.key);
    } else {
      empty.push(s.slot);
    }
  }
  return empty;
}

export function findCandidate(state: PhotoState, key: string): Candidate | undefined {
  for (const q of Object.values(state.queries)) {
    const c = q.candidates.find((x) => x.key === key);
    if (c) return c;
  }
  return undefined;
}

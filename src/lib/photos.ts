/**
 * 사진 검색 (SPEC 3-3): Unsplash 우선, 부족하면 Pexels.
 * - 세로(portrait) 우선, 가로 1000px 이상 우선, 600px 미만 제외
 * - 광고/후원·유료(Unsplash+)·AI 생성 표시·글자가 박힌 사진은 설명/태그 기준으로 제외
 * - 작가명/링크를 함께 저장해 크레딧(`작가명 / Unsplash`)을 자동으로 만든다
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type PhotoSource = "unsplash" | "pexels";

export type Candidate = {
  /** "unsplash:abc123" 처럼 출처까지 포함한 고유 키 */
  key: string;
  source: PhotoSource;
  id: string;
  width: number;
  height: number;
  /** 대표 색 (#rrggbb) */
  color: string | null;
  description: string;
  /** 미리보기용 작은 이미지 */
  thumb: string;
  /** 렌더링용으로 내려받을 이미지 (가로 2000px) */
  image: string;
  /** 사진 페이지 */
  page: string;
  author: string;
  authorLink: string;
  /** Unsplash 다운로드 집계용 엔드포인트 (사용할 때 1회 호출해야 함) */
  downloadLocation?: string;
};

type RawFlags = { sponsored?: boolean; paid?: boolean };
type SourceResult = { candidate: Candidate; raw: RawFlags }[];

export type PhotoKeys = { unsplash?: string; pexels?: string };
export type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<Response>;

/** 화면/API에 보여주는 후보 수 (SPEC 3-3) */
export const CANDIDATE_COUNT = 6;
/** 원고 매칭용 후보 수: 비슷한 검색어끼리 결과가 겹치고 표지+콜라주가 검색어를 공유해서 여유를 둔다 */
export const MATCH_CANDIDATE_COUNT = 10;
export const MIN_WIDTH = 600;
export const PREFERRED_WIDTH = 1000;
const APP_NAME = "small_magazine_maker";
const SOURCE_LABEL: Record<PhotoSource, string> = { unsplash: "Unsplash", pexels: "Pexels" };

export function keysFromEnv(): PhotoKeys {
  return {
    unsplash: process.env.UNSPLASH_ACCESS_KEY?.trim() || undefined,
    pexels: process.env.PEXELS_API_KEY?.trim() || undefined,
  };
}

/** 렌더링 크레딧: "작가명 / Unsplash" → 화면에는 "photo | 작가명 / Unsplash" */
export function creditOf(c: Pick<Candidate, "author" | "source">): string {
  return `${c.author} / ${SOURCE_LABEL[c.source]}`;
}

// ---------------------------------------------------------------------------
// 제외 규칙
// ---------------------------------------------------------------------------

/** 설명·태그에 이 단어가 있으면 제외 (글자 사진, AI 생성, 일러스트, 유명인/성인 매체) */
const EXCLUDE_WORDS = [
  // 글자가 박힌 사진
  "text", "quote", "typography", "lettering", "signage", "neon sign", "billboard", "poster", "logo",
  "letter board", "handwriting", "calligraphy", "words", "menu board",
  // AI 생성·일러스트
  "ai generated", "ai-generated", "generative ai", "midjourney", "dall-e", "stable diffusion",
  "illustration", "3d render", "rendering", "cgi", "vector",
  // 유명인·성인 매체
  "celebrity", "magazine cover", "playboy", "lingerie", "nude", "erotic",
];

const EXCLUDE_RE = new RegExp(`\\b(${EXCLUDE_WORDS.map((w) => w.replace(/[-\s]/g, "[-\\s]?")).join("|")})\\b`, "i");

export function exclusionReason(c: Candidate, raw?: RawFlags): string | null {
  if (raw?.sponsored) return "광고/후원";
  if (raw?.paid) return "유료(Unsplash+)";
  if (c.width < MIN_WIDTH) return `가로 ${c.width}px`;
  const m = c.description.match(EXCLUDE_RE);
  if (m) return `설명에 "${m[0]}"`;
  return null;
}

// ---------------------------------------------------------------------------
// 정렬: 세로 > 큰 사진 > 밝은 사진 (같은 점수면 API 관련도 순서 유지)
// ---------------------------------------------------------------------------

/** 대표 색 밝기 0~1 */
export function luminance(hex: string | null): number | null {
  const m = hex?.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function score(c: Candidate): number {
  let s = 0;
  if (c.height > c.width) s += 2;
  if (c.width >= PREFERRED_WIDTH) s += 1;
  const lum = luminance(c.color);
  if (lum !== null) {
    if (lum >= 0.45) s += 1; // 밝은 낮의 자연광
    if (lum < 0.2) s -= 2; // 어두운 무드
  }
  return s;
}

export function rank(cands: Candidate[]): Candidate[] {
  return cands
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const utm = (url: string) => `${url}${url.includes("?") ? "&" : "?"}utm_source=${APP_NAME}&utm_medium=referral`;

type UnsplashResult = {
  id: string;
  width: number;
  height: number;
  color: string | null;
  description: string | null;
  alt_description?: string | null;
  urls: { raw: string; small: string };
  links: { html: string; download_location: string };
  user: { name: string; links: { html: string } };
  tags?: { title?: string }[];
  sponsorship?: unknown;
  premium?: boolean;
  plus?: boolean;
};

async function getJson<T>(fetchFn: FetchLike, url: string, headers: Record<string, string>, label: string): Promise<T> {
  const res = await fetchFn(url, { headers });
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? " (API 키를 확인해 주세요)" : res.status === 429 ? " (요청 한도 초과)" : "";
    throw new Error(`${label} 검색 실패: HTTP ${res.status}${hint}`);
  }
  return (await res.json()) as T;
}

export async function searchUnsplash(query: string, key: string, fetchFn: FetchLike = fetch): Promise<SourceResult> {
  const params = new URLSearchParams({ query, orientation: "portrait", content_filter: "high", per_page: "30" });
  const data = await getJson<{ results: UnsplashResult[] }>(
    fetchFn,
    `https://api.unsplash.com/search/photos?${params}`,
    { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    "Unsplash",
  );
  return data.results.map((r) => {
    const description = [r.description, r.alt_description, ...(r.tags ?? []).map((t) => t.title)].filter(Boolean).join(" · ");
    const candidate: Candidate = {
      key: `unsplash:${r.id}`,
      source: "unsplash",
      id: r.id,
      width: r.width,
      height: r.height,
      color: r.color,
      description,
      thumb: r.urls.small,
      image: `${r.urls.raw}${r.urls.raw.includes("?") ? "&" : "?"}w=2000&q=85&fm=jpg&fit=max`,
      page: utm(r.links.html),
      author: r.user.name,
      authorLink: utm(r.user.links.html),
      downloadLocation: r.links.download_location,
    };
    return { candidate, raw: { sponsored: Boolean(r.sponsorship), paid: Boolean(r.premium || r.plus) } };
  });
}

type PexelsPhoto = {
  id: number;
  width: number;
  height: number;
  url: string;
  alt: string | null;
  avg_color: string | null;
  photographer: string;
  photographer_url: string;
  src: { original: string; medium: string };
};

export async function searchPexels(query: string, key: string, fetchFn: FetchLike = fetch): Promise<SourceResult> {
  const params = new URLSearchParams({ query, orientation: "portrait", per_page: "30" });
  const data = await getJson<{ photos: PexelsPhoto[] }>(
    fetchFn,
    `https://api.pexels.com/v1/search?${params}`,
    { Authorization: key },
    "Pexels",
  );
  return data.photos.map((p) => ({
    candidate: {
      key: `pexels:${p.id}`,
      source: "pexels" as const,
      id: String(p.id),
      width: p.width,
      height: p.height,
      color: p.avg_color,
      description: p.alt ?? "",
      thumb: p.src.medium,
      image: `${p.src.original}?auto=compress&cs=tinysrgb&w=2000`,
      page: p.url,
      author: p.photographer,
      authorLink: p.photographer_url,
    } satisfies Candidate,
    raw: {},
  }));
}

export type SearchResult = { candidates: Candidate[]; excluded: { key: string; reason: string }[] };

/** 후보 6장: Unsplash에서 먼저 채우고, 모자라면 Pexels로 채운다 */
export async function searchPhotos(
  query: string,
  opts: { keys?: PhotoKeys; fetch?: FetchLike; count?: number } = {},
): Promise<SearchResult> {
  const keys = opts.keys ?? keysFromEnv();
  const fetchFn = opts.fetch ?? fetch;
  const count = opts.count ?? CANDIDATE_COUNT;
  if (!keys.unsplash && !keys.pexels) {
    throw new Error("사진 API 키가 없습니다: .env.local에 UNSPLASH_ACCESS_KEY 또는 PEXELS_API_KEY를 넣어 주세요");
  }

  const picked: Candidate[] = [];
  const excluded: SearchResult["excluded"] = [];
  const errors: string[] = [];

  const sources: [string | undefined, typeof searchUnsplash][] = [
    [keys.unsplash, searchUnsplash],
    [keys.pexels, searchPexels],
  ];
  for (const [key, search] of sources) {
    if (!key || picked.length >= count) continue;
    let results: SourceResult;
    try {
      results = await search(query, key, fetchFn);
    } catch (err) {
      errors.push((err as Error).message);
      continue;
    }
    const ok: Candidate[] = [];
    for (const { candidate, raw } of results) {
      const reason = exclusionReason(candidate, raw);
      if (reason) excluded.push({ key: candidate.key, reason });
      else ok.push(candidate);
    }
    picked.push(...rank(ok).slice(0, count - picked.length));
  }

  if (picked.length === 0 && errors.length) throw new Error(errors.join(" / "));
  return { candidates: picked, excluded };
}

// ---------------------------------------------------------------------------
// 내려받기
// ---------------------------------------------------------------------------

const EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

/**
 * 사진을 dir에 저장하고 파일 이름을 돌려준다.
 * Unsplash는 API 가이드라인에 따라 download_location을 함께 호출한다.
 */
export async function downloadPhoto(
  c: Candidate,
  dir: string,
  opts: { keys?: PhotoKeys; fetch?: FetchLike } = {},
): Promise<string> {
  const keys = opts.keys ?? keysFromEnv();
  const fetchFn = opts.fetch ?? fetch;

  if (c.source === "unsplash" && c.downloadLocation && keys.unsplash) {
    // 집계용 호출 — 실패해도 사진 저장은 계속
    await fetchFn(c.downloadLocation, { headers: { Authorization: `Client-ID ${keys.unsplash}`, "Accept-Version": "v1" } }).catch(
      () => undefined,
    );
  }

  const res = await fetchFn(c.image);
  if (!res.ok) throw new Error(`사진 내려받기 실패 (${c.key}): HTTP ${res.status}`);
  const type = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  const file = `${c.source}-${c.id.replace(/[^\w-]/g, "")}${EXT[type] ?? ".jpg"}`;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), Buffer.from(await res.arrayBuffer()));
  return file;
}

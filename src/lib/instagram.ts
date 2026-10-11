/**
 * Instagram 캐러셀 게시 (Instagram Graph API — 콘텐츠 게시)
 *
 * 흐름: 이미지마다 캐러셀 항목 컨테이너 → CAROUSEL 컨테이너(캡션) → 상태 FINISHED 확인 → media_publish
 * - 이미지는 JPEG만 받는다. Instagram 서버가 가져갈 수 있는 **공개 URL**이어야 한다.
 * - 캐러셀은 최대 10장. 표지는 A/B 중 하나만 쓴다 → 9장.
 * - API에는 예약 기능이 없어서 예약은 이 앱의 스케줄러가 시간에 맞춰 게시한다.
 *
 * 환경변수
 *   INSTAGRAM_ACCESS_TOKEN  장기 액세스 토큰 (instagram_business_content_publish 권한)
 *   INSTAGRAM_USER_ID       Instagram 프로페셔널 계정 ID
 *   INSTAGRAM_GRAPH_HOST    기본 graph.instagram.com (Facebook 로그인 토큰이면 graph.facebook.com)
 *   INSTAGRAM_API_VERSION   기본 v26.0
 *   PUBLIC_BASE_URL         이 앱에 외부에서 접근 가능한 주소 (예: https://xxxx.trycloudflare.com)
 */

export type InstagramConfig = {
  token: string;
  userId: string;
  host: string;
  version: string;
  publicBaseUrl: string;
};

export type FetchLike = (url: string, init?: { method?: string; body?: URLSearchParams }) => Promise<Response>;

export const CAPTION_MAX = 2200;
export const HASHTAG_MAX = 30;
export const CAROUSEL_MAX = 10;

export function configFromEnv(): { config?: InstagramConfig; missing: string[] } {
  const env = process.env;
  const token = env.INSTAGRAM_ACCESS_TOKEN?.trim();
  const userId = env.INSTAGRAM_USER_ID?.trim();
  const publicBaseUrl = env.PUBLIC_BASE_URL?.trim().replace(/\/+$/, "");
  const missing = [
    !token && "INSTAGRAM_ACCESS_TOKEN",
    !userId && "INSTAGRAM_USER_ID",
    !publicBaseUrl && "PUBLIC_BASE_URL",
  ].filter(Boolean) as string[];
  if (missing.length) return { missing };
  return {
    missing,
    config: {
      token: token!,
      userId: userId!,
      publicBaseUrl: publicBaseUrl!,
      host: env.INSTAGRAM_GRAPH_HOST?.trim() || "graph.instagram.com",
      version: env.INSTAGRAM_API_VERSION?.trim() || "v26.0",
    },
  };
}

/** 캡션 + 해시태그 → 게시용 캡션 (길이·해시태그 수 확인) */
export function buildCaption(caption: string, hashtags: string[]): { text: string; problems: string[] } {
  const tags = hashtags.filter(Boolean);
  const text = tags.length ? `${caption.trim()}\n\n${tags.join(" ")}` : caption.trim();
  const problems: string[] = [];
  if (text.length > CAPTION_MAX) problems.push(`캡션이 ${CAPTION_MAX}자를 넘습니다 (${text.length}자)`);
  const tagCount = (text.match(/#[^\s#]+/g) ?? []).length;
  if (tagCount > HASHTAG_MAX) problems.push(`해시태그가 ${HASHTAG_MAX}개를 넘습니다 (${tagCount}개)`);
  return { text, problems };
}

export class InstagramError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

function graph(config: InstagramConfig, fetchFn: FetchLike) {
  const base = `https://${config.host}/${config.version}`;
  async function call<T>(method: "GET" | "POST", path: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams({ ...params, access_token: config.token });
    let res: Response;
    try {
      res = method === "GET" ? await fetchFn(`${base}/${path}?${qs}`) : await fetchFn(`${base}/${path}`, { method: "POST", body: qs });
    } catch (err) {
      const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err as Error).message;
      throw new InstagramError(`Instagram API(${config.host})에 연결하지 못했어요 (${cause}). 인터넷 연결을 확인해 주세요`);
    }
    const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string; code?: number; error_user_msg?: string } };
    if (!res.ok || data.error) {
      const e = data.error;
      const msg = e?.error_user_msg || e?.message || `HTTP ${res.status}`;
      const hint = e?.code === 190 ? " (토큰이 만료됐거나 잘못됐어요)" : e?.code === 9 || e?.code === 4 ? " (요청 한도 초과)" : "";
      throw new InstagramError(`Instagram API 오류: ${msg}${hint}`, e?.code);
    }
    return data;
  }
  return { call };
}

export type PublishLimit = { quota_usage: number; config?: { quota_total?: number; quota_duration?: number } };

/** 24시간 게시 한도 사용량 */
export async function getPublishingLimit(config: InstagramConfig, fetchFn: FetchLike = fetch): Promise<PublishLimit | null> {
  const { call } = graph(config, fetchFn);
  const r = await call<{ data?: PublishLimit[] }>("GET", `${config.userId}/content_publishing_limit`, { fields: "quota_usage,config" });
  return r.data?.[0] ?? null;
}

export type PublishResult = { mediaId: string; permalink?: string };

export async function publishCarousel(
  input: { imageUrls: string[]; caption: string },
  config: InstagramConfig,
  opts: {
    fetch?: FetchLike;
    log?: (msg: string) => void;
    /** 컨테이너 상태 확인 간격/횟수 */
    pollMs?: number;
    pollTries?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<PublishResult> {
  const fetchFn = opts.fetch ?? fetch;
  const log = opts.log ?? (() => {});
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const { call } = graph(config, fetchFn);

  if (input.imageUrls.length < 2 || input.imageUrls.length > CAROUSEL_MAX) {
    throw new InstagramError(`캐러셀은 2~${CAROUSEL_MAX}장이어야 합니다 (현재 ${input.imageUrls.length}장)`);
  }

  // 1) 이미지별 캐러셀 항목 컨테이너
  const children: string[] = [];
  for (const [i, url] of input.imageUrls.entries()) {
    const r = await call<{ id: string }>("POST", `${config.userId}/media`, { image_url: url, is_carousel_item: "true" });
    children.push(r.id);
    log(`  · 이미지 ${i + 1}/${input.imageUrls.length} 업로드`);
  }

  // 2) 캐러셀 컨테이너 (캡션은 여기에만)
  const carousel = await call<{ id: string }>("POST", `${config.userId}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: input.caption,
  });

  // 3) 준비될 때까지 대기
  const tries = opts.pollTries ?? 30;
  for (let i = 0; ; i++) {
    const s = await call<{ status_code?: string; status?: string }>("GET", carousel.id, { fields: "status_code,status" });
    if (s.status_code === "FINISHED") break;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") {
      throw new InstagramError(`캐러셀 준비 실패: ${s.status_code}${s.status ? ` (${s.status})` : ""}`);
    }
    if (i >= tries) throw new InstagramError("캐러셀 준비가 너무 오래 걸립니다. 잠시 후 다시 시도해 주세요");
    await sleep(opts.pollMs ?? 2000);
  }

  // 4) 게시
  const published = await call<{ id: string }>("POST", `${config.userId}/media_publish`, { creation_id: carousel.id });
  log("  · 게시 완료");
  let permalink: string | undefined;
  try {
    permalink = (await call<{ permalink?: string }>("GET", published.id, { fields: "permalink" })).permalink;
  } catch {
    // 게시는 됐으니 링크를 못 가져와도 성공으로 본다
  }
  return { mediaId: published.id, permalink };
}

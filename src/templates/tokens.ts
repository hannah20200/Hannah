/**
 * 디자인 수치(좌표·크기·색)는 이 파일에만 둔다. (SPEC 4장)
 *
 * 좌표 규칙: 텍스트의 y는 "그 줄의 세로 중심"이다.
 * (예: 표지 제목 첫 줄 y=1010 → 첫 줄 박스의 중심이 1010)
 */

export const canvas = { width: 1080, height: 1350 } as const;

export const color = {
  ink: "#1E1B18",
  butter: "#F5DB8B",
  white: "#FFFFFF",
  textShadow: "0 2px 14px rgba(0,0,0,.45)",
  /** 사진이 없을 때 쓰는 대체 배경 (흰 단색 금지) */
  fallbackBg: "linear-gradient(160deg, #8a6e55 0%, #4a3a2e 100%)",
} as const;

export const font = {
  sans: "Pretendard",
  hand: "Nanum Pen Script",
  /** public/fonts 안의 파일 */
  files: [
    { family: "Pretendard", weight: 500, file: "Pretendard-Medium.woff2", format: "woff2" },
    { family: "Pretendard", weight: 600, file: "Pretendard-SemiBold.woff2", format: "woff2" },
    { family: "Pretendard", weight: 700, file: "Pretendard-Bold.woff2", format: "woff2" },
    { family: "Pretendard", weight: 800, file: "Pretendard-ExtraBold.woff2", format: "woff2" },
    { family: "Nanum Pen Script", weight: 400, file: "NanumPenScript-Regular.ttf", format: "truetype" },
  ],
  /** 한 줄짜리 텍스트가 넘칠 때 자동으로 줄일 수 있는 최소 비율 */
  minFitScale: 0.72,
} as const;

export const film = {
  /** 따뜻한 soft-light 레이어 */
  warm: "rgba(120,80,40,.10)",
  noiseAlpha: 0.035,
  noiseFrequency: 0.9,
} as const;

export const credit = {
  x: 48,
  y: 1310,
  size: 18,
  weight: 500,
  color: "rgba(255,255,255,.75)",
  prefix: "photo | ",
} as const;

export const cover = {
  /** 사진 세로 기준점 (object-position y) */
  focalY: 0.3,
  topGradient: { from: 0, to: 240, startColor: "rgba(0,0,0,.40)" },
  bottomGradient: { from: 640, endColor: "rgba(0,0,0,.82)" },
  topLine: { y: 120, size: 32, weight: 600, sidePadding: 72 },
  title: { x: 72, firstY: 1010, size: 70, weight: 800, lineGap: 88, letterSpacing: -1.5 },
  sub: { size: 29, weight: 500, color: "rgba(255,255,255,.90)", gapAfterTitle: 14, lineHeight: 42 },
  collage: {
    width: 220,
    height: 280,
    shadow: "0 10px 24px rgba(0,0,0,.40)",
    /** 사진 테두리 (0이면 테두리 없음) */
    border: 6,
    borderColor: "#F7F3EC",
    radius: 2,
    /** 중심 좌표 + 회전(도). 얼굴을 가리지 않는 기본 위치 */
    slots: [
      { cx: 880, cy: 340, rotate: 4.5 },
      { cx: 170, cy: 420, rotate: -4 },
    ],
  },
} as const;

export const page = {
  bgBlur: 28,
  /** 블러 가장자리가 비치지 않게 배경을 살짝 키움 */
  bgScale: 1.12,
  bgDim: "rgba(20,14,8,.45)",
  label: { y: 130, size: 22, weight: 700, letterSpacing: 4 },
  title: { y: 192, size: 42, weight: 700, sidePadding: 60, letterSpacing: -0.5 },
  card: {
    width: 820,
    heightWithTitle: 660,
    heightIntro: 760,
    /** 카드 윗변 y */
    topWithTitle: 252,
    topIntro: 140,
    radius: 4,
    shadow: "0 14px 30px rgba(0,0,0,.45)",
  },
  body: {
    /** 카드 아래 +76 = 본문 첫 줄 중심 */
    offsetFromCard: 76,
    size: 29,
    weight: 500,
    lineHeight: 46,
    color: "rgba(255,255,255,.92)",
    width: 880,
  },
  key: {
    size: 32,
    weight: 800,
    lineHeight: 48,
    gapBefore: 18,
    underline: 2.5,
    underlineOffset: 7,
  },
  pick: {
    height: 56,
    radius: 28,
    size: 26,
    weight: 600,
    border: 2,
    paddingX: 30,
    gapBefore: 30,
  },
} as const;

export const end = {
  bgDim: "rgba(0,0,0,.50)",
  centerY: 660,
  question: { size: 64, weight: 800, lineHeight: 86, letterSpacing: -1.5 },
  cta: { size: 34, weight: 600, gapBefore: 44 },
  sidePadding: 72,
} as const;

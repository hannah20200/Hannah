import type { CSSProperties, ReactNode } from "react";
import type { Photo } from "../lib/schema";
import { canvas, color, credit, film, font } from "./tokens";

/** y를 "줄 중심"으로 쓰는 절대배치 텍스트 한 줄의 top 계산 */
export const centerTop = (y: number, lineHeight: number) => y - lineHeight / 2;

/** 슬라이드 공통 틀: 1080×1350 캔버스 + 필름 처리 + 크레딧 */
export function Frame({ children, credits }: { children: ReactNode; credits: Photo[] }) {
  return (
    <div
      id="slide"
      style={{
        position: "relative",
        width: canvas.width,
        height: canvas.height,
        overflow: "hidden",
        background: color.ink,
        fontFamily: `${font.sans}, sans-serif`,
        color: color.white,
        wordBreak: "keep-all",
      }}
    >
      {children}
      <Film />
      <Credit photos={credits} />
    </div>
  );
}

function Film() {
  const noise = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">` +
      `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${film.noiseFrequency}" numOctaves="2" stitchTiles="stitch"/>` +
      `<feColorMatrix type="saturate" values="0"/></filter>` +
      `<rect width="100%" height="100%" filter="url(#n)"/></svg>`,
  );
  const layer: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
  return (
    <>
      <div style={{ ...layer, background: film.warm, mixBlendMode: "soft-light" }} />
      <div
        style={{
          ...layer,
          backgroundImage: `url("data:image/svg+xml,${noise}")`,
          backgroundSize: "400px 400px",
          opacity: film.noiseAlpha,
        }}
      />
    </>
  );
}

/** 사진을 쓴 장에만 좌하단 "photo | 출처" */
function Credit({ photos }: { photos: Photo[] }) {
  const names = [...new Set(photos.map((p) => p.credit))];
  if (names.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: credit.x,
        top: centerTop(credit.y, credit.size * 1.4),
        lineHeight: `${credit.size * 1.4}px`,
        fontSize: credit.size,
        fontWeight: credit.weight,
        color: credit.color,
        whiteSpace: "nowrap",
        letterSpacing: 0.2,
      }}
    >
      {credit.prefix}
      {names.join(", ")}
    </div>
  );
}

/** 사진 풀블리드(cover-fit). 사진이 없으면 대체 그라데이션 */
export function FullPhoto({ photo, focalY = 0.5, style }: { photo?: Photo; focalY?: number; style?: CSSProperties }) {
  const base: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", ...style };
  if (!photo) return <div style={{ ...base, background: color.fallbackBg }} />;
  return (
    <img
      src={photo.src}
      alt=""
      style={{ ...base, objectFit: "cover", objectPosition: `50% ${focalY * 100}%`, display: "block" }}
    />
  );
}

/** 본문/마무리 배경: 같은 사진을 흐리게 + 어둡게 (흰 단색 배경 금지) */
export function BlurBackground({ photo, blur, scale, dim }: { photo?: Photo; blur: number; scale: number; dim: string }) {
  return (
    <>
      <FullPhoto photo={photo} style={{ filter: `blur(${blur}px)`, transform: `scale(${scale})` }} />
      <div style={{ position: "absolute", inset: 0, background: dim }} />
    </>
  );
}

/** 한 줄 텍스트: 넘치면 렌더러가 글자 크기를 줄인다(data-fit) */
export function FitLine({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div data-fit="1" style={{ whiteSpace: "nowrap", ...style }}>
      {children}
    </div>
  );
}

import type { Cover as CoverData } from "../lib/schema";
import { FitLine, Frame, FullPhoto, centerTop } from "./shared";
import { color, cover as t } from "./tokens";

export function Cover({ data }: { data: CoverData }) {
  const collage = data.collage ?? [];
  const credits = [data.photo, ...collage].filter((p) => p !== undefined);
  const titleTop = centerTop(t.title.firstY, t.title.lineGap);

  return (
    <Frame credits={credits}>
      <FullPhoto photo={data.photo} focalY={t.focalY} />

      {/* 상단 그라데이션 0→240 (검정 40%→0) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: t.topGradient.from,
          height: t.topGradient.to - t.topGradient.from,
          background: `linear-gradient(to bottom, ${t.topGradient.startColor}, rgba(0,0,0,0))`,
        }}
      />
      {/* 하단 그라데이션 640→끝 (0→82%) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: t.bottomGradient.from,
          bottom: 0,
          background: `linear-gradient(to bottom, rgba(0,0,0,0), ${t.bottomGradient.endColor})`,
        }}
      />

      {collage.map((p, i) => {
        const slot = t.collage.slots[i];
        if (!slot) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: slot.cx - t.collage.width / 2,
              top: slot.cy - t.collage.height / 2,
              width: t.collage.width,
              height: t.collage.height,
              transform: `rotate(${slot.rotate}deg)`,
              boxShadow: t.collage.shadow,
              border: t.collage.border ? `${t.collage.border}px solid ${t.collage.borderColor}` : undefined,
              borderRadius: t.collage.radius,
              overflow: "hidden",
              background: t.collage.borderColor,
            }}
          >
            <img src={p.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        );
      })}

      {/* 상단 한 줄(속마음) */}
      <FitLine
        style={{
          position: "absolute",
          left: t.topLine.sidePadding,
          right: t.topLine.sidePadding,
          top: centerTop(t.topLine.y, t.topLine.size * 1.4),
          lineHeight: `${t.topLine.size * 1.4}px`,
          fontSize: t.topLine.size,
          fontWeight: t.topLine.weight,
          textAlign: "center",
          textShadow: color.textShadow,
        }}
      >
        {data.top_line}
      </FitLine>

      {/* 제목 + 부제 */}
      <div style={{ position: "absolute", left: t.title.x, right: t.title.x, top: titleTop }}>
        {data.title.map((line, i) => (
          <FitLine
            key={i}
            style={{
              fontSize: t.title.size,
              fontWeight: t.title.weight,
              lineHeight: `${t.title.lineGap}px`,
              letterSpacing: t.title.letterSpacing,
              textShadow: color.textShadow,
            }}
          >
            {line}
          </FitLine>
        ))}
        <FitLine
          style={{
            marginTop: t.sub.gapAfterTitle,
            fontSize: t.sub.size,
            fontWeight: t.sub.weight,
            lineHeight: `${t.sub.lineHeight}px`,
            color: t.sub.color,
            textShadow: color.textShadow,
          }}
        >
          {data.sub}
        </FitLine>
      </div>
    </Frame>
  );
}

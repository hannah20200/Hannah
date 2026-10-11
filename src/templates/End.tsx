import type { End as EndData } from "../lib/schema";
import { BlurBackground, FitLine, Frame } from "./shared";
import { color, end as t, page } from "./tokens";

/** 마무리: 사진 blur + 어둡게 50%, 중앙 질문 + 댓글/저장 유도 */
export function End({ data }: { data: EndData }) {
  return (
    <Frame credits={data.photo ? [data.photo] : []}>
      <BlurBackground photo={data.photo} blur={page.bgBlur} scale={page.bgScale} dim={t.bgDim} />
      <div
        style={{
          position: "absolute",
          left: t.sidePadding,
          right: t.sidePadding,
          top: t.centerY,
          transform: "translateY(-50%)",
          textAlign: "center",
        }}
      >
        {data.lines.map((line, i) => (
          <FitLine
            key={i}
            style={{
              fontSize: t.question.size,
              fontWeight: t.question.weight,
              lineHeight: `${t.question.lineHeight}px`,
              letterSpacing: t.question.letterSpacing,
              textShadow: color.textShadow,
            }}
          >
            {line}
          </FitLine>
        ))}
        <FitLine
          style={{
            marginTop: t.cta.gapBefore,
            fontSize: t.cta.size,
            fontWeight: t.cta.weight,
            color: color.butter,
            textShadow: color.textShadow,
          }}
        >
          {data.cta}
        </FitLine>
      </div>
    </Frame>
  );
}

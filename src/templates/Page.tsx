import type { Intro, Item, Photo } from "../lib/schema";
import { BlurBackground, FitLine, Frame, centerTop } from "./shared";
import { canvas, color, page as t } from "./tokens";

type PageProps =
  | { kind: "intro"; data: Intro }
  | {
      kind: "item";
      data: Item;
      /** 게시물 카테고리 라벨 (없으면 표시 안 함) */ label?: string;
    };

/** 본문 장: 같은 사진을 흐리게 깐 배경 + 선명한 사진 카드 */
export function Page(props: PageProps) {
  const { data } = props;
  const isItem = props.kind === "item";
  const photo = data.photo;
  const cardTop = isItem ? t.card.topWithTitle : t.card.topIntro;
  const cardHeight = isItem ? t.card.heightWithTitle : t.card.heightIntro;
  const textTop =
    cardTop + cardHeight + t.body.offsetFromCard - t.body.lineHeight / 2;

  return (
    <Frame credits={photo ? [photo] : []}>
      <BlurBackground
        photo={photo}
        blur={t.bgBlur}
        scale={t.bgScale}
        dim={t.bgDim}
      />

      {props.kind === "item" && (
        <>
          {props.label && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: centerTop(t.label.y, t.label.size * 1.4),
                lineHeight: `${t.label.size * 1.4}px`,
                fontSize: t.label.size,
                fontWeight: t.label.weight,
                letterSpacing: t.label.letterSpacing,
                // 자간이 오른쪽에 붙어 중앙이 밀리는 것 보정
                paddingLeft: t.label.letterSpacing,
                color: color.butter,
                textAlign: "center",
                textShadow: color.textShadow,
              }}
            >
              {props.label}
            </div>
          )}
          <FitLine
            style={{
              position: "absolute",
              left: t.title.sidePadding,
              right: t.title.sidePadding,
              top: centerTop(t.title.y, t.title.size * 1.4),
              lineHeight: `${t.title.size * 1.4}px`,
              fontSize: t.title.size,
              fontWeight: t.title.weight,
              letterSpacing: t.title.letterSpacing,
              textAlign: "center",
              textShadow: color.textShadow,
            }}
          >
            {props.data.head}
          </FitLine>
        </>
      )}

      <Card photo={photo} top={cardTop} height={cardHeight} />

      <div
        style={{
          position: "absolute",
          left: (canvas.width - t.body.width) / 2,
          width: t.body.width,
          top: textTop,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {data.body.map((line, i) => (
          <div
            key={`b${i}`}
            style={{
              fontSize: t.body.size,
              fontWeight: t.body.weight,
              lineHeight: `${t.body.lineHeight}px`,
              color: t.body.color,
              textShadow: color.textShadow,
            }}
          >
            {line}
          </div>
        ))}
        <div style={{ marginTop: t.key.gapBefore }}>
          {data.key.map((line, i) => (
            <div
              key={`k${i}`}
              style={{
                fontSize: t.key.size,
                fontWeight: t.key.weight,
                lineHeight: `${t.key.lineHeight}px`,
                color: color.butter,
                textDecorationLine: "underline",
                textDecorationThickness: t.key.underline,
                textUnderlineOffset: t.key.underlineOffset,
                textShadow: color.textShadow,
              }}
            >
              {line}
            </div>
          ))}
        </div>
        {props.kind === "item" && <Pick text={props.data.pick} />}
      </div>
    </Frame>
  );
}

function Card({
  photo,
  top,
  height,
}: {
  photo?: Photo;
  top: number;
  height: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: (canvas.width - t.card.width) / 2,
        top,
        width: t.card.width,
        height,
        borderRadius: t.card.radius,
        overflow: "hidden",
        boxShadow: t.card.shadow,
        background: color.fallbackBg,
      }}
    >
      {photo && (
        <img
          src={photo.src}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      )}
    </div>
  );
}

/** "PICK · 선택지" → BUTTER 테두리 알약 */
function Pick({ text }: { text: string }) {
  const [, label = "PICK", rest = text] =
    text.match(/^(PICK)\s*·\s*(.*)$/) ?? [];
  return (
    <div
      data-fit="1"
      style={{
        marginTop: t.pick.gapBefore,
        height: t.pick.height,
        maxWidth: t.body.width,
        boxSizing: "border-box",
        padding: `0 ${t.pick.paddingX}px`,
        borderRadius: t.pick.radius,
        border: `${t.pick.border}px solid ${color.butter}`,
        display: "flex",
        alignItems: "center",
        whiteSpace: "nowrap",
        fontSize: t.pick.size,
        fontWeight: t.pick.weight,
        textShadow: color.textShadow,
      }}
    >
      <span style={{ color: color.butter, fontWeight: 800, letterSpacing: 1 }}>
        {label}
      </span>
      <span style={{ color: color.butter, margin: "0 12px" }}>·</span>
      <span>{rest}</span>
    </div>
  );
}

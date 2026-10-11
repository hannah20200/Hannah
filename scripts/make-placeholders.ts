/**
 * 샘플 렌더용 로컬 placeholder 사진(SVG) 생성.
 * 실제 사진은 3단계(Unsplash/Pexels 연결)에서 교체된다.
 *   npx tsx scripts/make-placeholders.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Kind = "person" | "still" | "window";
type Spec = { id: string; kind: Kind; wall: [string, string]; floor: string; accent: string; note: string };

const specs: Spec[] = [
  { id: "ph01", kind: "person", wall: ["#efe3cf", "#d8c2a2"], floor: "#b89a76", accent: "#9b7653", note: "trench coat, book, cafe" },
  { id: "ph02", kind: "still", wall: ["#f3ead9", "#dccbb0"], floor: "#a88a68", accent: "#c4553b", note: "coffee, open book" },
  { id: "ph03", kind: "window", wall: ["#e9e4d6", "#c9c2ad"], floor: "#8f8a74", accent: "#6f7d5c", note: "window light, glasses" },
  { id: "ph04", kind: "person", wall: ["#e7ddd0", "#c7b7a3"], floor: "#7e6a58", accent: "#2f3a4a", note: "glasses, coffee, window" },
  { id: "ph05", kind: "still", wall: ["#ece2d2", "#cfbfa5"], floor: "#94785c", accent: "#5b6e8a", note: "books stack" },
  { id: "ph06", kind: "window", wall: ["#f1e8da", "#d5c4aa"], floor: "#a68b6c", accent: "#b9874f", note: "afternoon desk" },
  { id: "ph07", kind: "person", wall: ["#ede6da", "#cdbfac"], floor: "#8b7763", accent: "#7a4f3a", note: "reading by window" },
  { id: "ph08", kind: "still", wall: ["#efe6d6", "#d3c0a2"], floor: "#9c8064", accent: "#3f5a4a", note: "saved notes, phone" },
  { id: "ph09", kind: "still", wall: ["#f4ecdf", "#dbcab0"], floor: "#a58d70", accent: "#e0b04f", note: "everyday mug, pen" },
  { id: "ph10", kind: "window", wall: ["#ebe1d3", "#c8b59b"], floor: "#86705a", accent: "#a6453a", note: "shopping list, wishlist" },
  { id: "ph11", kind: "person", wall: ["#e9e1d4", "#c4b29a"], floor: "#7a6652", accent: "#8a6a48", note: "favorite outfits" },
  { id: "ph12", kind: "person", wall: ["#efe7dc", "#cdbba3"], floor: "#8d7660", accent: "#22252b", note: "signature glasses" },
  { id: "ph13", kind: "window", wall: ["#ece3d5", "#cbb89d"], floor: "#8a735c", accent: "#7b8a6a", note: "calm evening, journal" },
];

const W = 1080;
const H = 1350;

function scene(s: Spec): string {
  const floorY = s.kind === "person" ? 1020 : 880;
  const parts: string[] = [];
  // 벽 + 바닥/테이블
  parts.push(`<rect width="${W}" height="${H}" fill="url(#wall)"/>`);
  parts.push(`<rect y="${floorY}" width="${W}" height="${H - floorY}" fill="${s.floor}"/>`);
  // 창문 빛(사선)
  parts.push(
    `<g opacity=".35" fill="#fffaf0"><polygon points="560,0 760,0 1080,520 1080,760"/><polygon points="820,0 900,0 1080,300 1080,420"/></g>`,
  );
  if (s.kind === "person") {
    // 트렌치코트 실루엣 + 책
    parts.push(`<ellipse cx="540" cy="430" rx="92" ry="112" fill="#e7c7a7"/>`);
    parts.push(`<path d="M448 400 q92 -170 184 0 q-10 -70 -92 -78 q-82 8 -92 78z" fill="#3a2a20"/>`);
    parts.push(`<rect x="476" y="410" width="58" height="26" rx="12" fill="none" stroke="#1e1b18" stroke-width="7"/>`);
    parts.push(`<rect x="546" y="410" width="58" height="26" rx="12" fill="none" stroke="#1e1b18" stroke-width="7"/>`);
    parts.push(`<path d="M380 1350 L410 640 Q540 560 670 640 L700 1350z" fill="${s.accent}"/>`);
    parts.push(`<path d="M540 600 L470 760 L540 1350 M540 600 L610 760 L540 1350" stroke="#00000022" stroke-width="10" fill="none"/>`);
    parts.push(`<rect x="440" y="820" width="200" height="140" rx="6" fill="#f6efe2" transform="rotate(-8 540 890)"/>`);
  } else if (s.kind === "still") {
    // 책 더미 + 머그
    parts.push(`<rect x="250" y="${floorY - 70}" width="420" height="70" rx="6" fill="${s.accent}"/>`);
    parts.push(`<rect x="280" y="${floorY - 130}" width="360" height="60" rx="6" fill="#f2ead8"/>`);
    parts.push(`<rect x="230" y="${floorY - 185}" width="400" height="55" rx="6" fill="#6b5240"/>`);
    parts.push(`<rect x="720" y="${floorY - 190}" width="150" height="190" rx="22" fill="#fbf7ef"/>`);
    parts.push(`<path d="M870 ${floorY - 150} q70 10 0 90" stroke="#fbf7ef" stroke-width="22" fill="none"/>`);
    parts.push(`<ellipse cx="540" cy="${floorY + 60}" rx="420" ry="28" fill="#00000018"/>`);
  } else {
    // 창틀 + 책상 위 소품
    parts.push(`<rect x="160" y="140" width="520" height="620" fill="#fffaf2" opacity=".55"/>`);
    parts.push(`<path d="M420 140 V760 M160 450 H680" stroke="${s.wall[1]}" stroke-width="18"/>`);
    parts.push(`<rect x="300" y="${floorY - 40}" width="300" height="40" rx="6" fill="${s.accent}"/>`);
    parts.push(`<circle cx="760" cy="${floorY - 60}" r="60" fill="#fbf7ef"/>`);
    parts.push(`<rect x="660" y="${floorY - 230}" width="40" height="170" rx="20" fill="#6d8a5a"/>`);
  }
  return parts.join("\n  ");
}

function svg(s: Spec): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${s.wall[0]}"/><stop offset="1" stop-color="${s.wall[1]}"/>
    </linearGradient>
  </defs>
  ${scene(s)}
  <!-- placeholder ${s.id}: ${s.note} -->
</svg>
`;
}

async function main() {
  const dir = path.resolve(import.meta.dirname, "../samples/photos");
  await mkdir(dir, { recursive: true });
  for (const s of specs) await writeFile(path.join(dir, `${s.id}.svg`), svg(s), "utf8");
  console.log(`${specs.length}개 생성 → ${path.relative(process.cwd(), dir)}`);
}

main();

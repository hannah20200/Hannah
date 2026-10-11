/**
 * 레퍼런스 항목과 새 원고 항목의 겹침 점검 (문자 2-gram 유사도).
 * 모델의 self_check와 별개로 서버에서 한 번 더 확인한다.
 */

const normalize = (s: string) =>
  s
    .replace(/^\s*\d+\s*[.)·]\s*/, "") // "1. " 같은 번호 제거
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Dice 계수 (0~1) */
export function similarity(a: string, b: string): number {
  const x = bigrams(normalize(a));
  const y = bigrams(normalize(b));
  if (x.length === 0 || y.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const g of y) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of x) {
    const n = pool.get(g) ?? 0;
    if (n > 0) {
      hit++;
      pool.set(g, n - 1);
    }
  }
  return (2 * hit) / (x.length + y.length);
}

export const OVERLAP_THRESHOLD = 0.5;

export type Overlap = { head: string; reference: string; score: number };

export function findOverlaps(heads: string[], referenceItems: string[], threshold = OVERLAP_THRESHOLD): Overlap[] {
  const found: Overlap[] = [];
  for (const head of heads) {
    for (const ref of referenceItems) {
      const score = similarity(head, ref);
      if (score >= threshold) found.push({ head, reference: ref, score: Math.round(score * 100) / 100 });
    }
  }
  return found;
}

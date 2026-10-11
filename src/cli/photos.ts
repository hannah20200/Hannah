/**
 * 원고 JSON에 사진 매칭 (Unsplash 우선, 부족하면 Pexels)
 *   npm run photos -- <draft.json> [--pick 자리=번호]... [--file 자리=경로[|크레딧]]... [--refresh] [--no-sheet]
 * 자리: cover.A, cover.A.collage1, cover.A.collage2, cover.B…, intro.1, item.1~6, end
 * 결과: draft.json에 photo/크레딧 기록, photos/ 에 사진 저장, photos.json(후보·선택 상태), photos.png(후보 시트)
 */
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findCandidate, emptyState, type PhotoState } from "../lib/photo-plan";
import { matchPhotos } from "../lib/photo-match";
import { DraftSchema } from "../lib/schema";
import { renderSheet, type SheetRow } from "../render/sheet";
import { flags, has, log, positional, runCli } from "./common";

function parseAssign(values: string[], name: string): [string, string][] {
  return values.map((v) => {
    const i = v.indexOf("=");
    if (i < 1) throw new Error(`--${name} 형식: 자리=값 (받은 값: ${v})`);
    return [v.slice(0, i).trim(), v.slice(i + 1).trim()];
  });
}

runCli(async () => {
  const [draftArg] = positional();
  if (!draftArg) throw new Error("사용법: npm run photos -- <draft.json> [--pick item.3=2] [--file item.3=./내사진.jpg|크레딧] [--refresh]");

  const draftPath = path.resolve(draftArg);
  const draftDir = path.dirname(draftPath);
  const parsed = DraftSchema.safeParse(JSON.parse(await readFile(draftPath, "utf8")));
  if (!parsed.success) {
    throw new Error(`원고 JSON 형식이 맞지 않습니다:\n${parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n")}`);
  }
  const draft = parsed.data;

  const statePath = path.join(draftDir, "photos.json");
  const state: PhotoState = existsSync(statePath) ? JSON.parse(await readFile(statePath, "utf8")) : emptyState();

  const picks = Object.fromEntries(
    parseAssign(flags("pick"), "pick").map(([slot, n]) => {
      const num = Number(n);
      if (!Number.isInteger(num) || num < 1) throw new Error(`--pick ${slot}=${n}: 번호는 1 이상의 정수`);
      return [slot, num];
    }),
  );
  const files = Object.fromEntries(
    parseAssign(flags("file"), "file").map(([slot, v]) => {
      const [p, credit] = v.split("|");
      return [slot, { path: path.resolve(p), credit }];
    }),
  );

  log("사진 검색…");
  const { slots, empty } = await matchPhotos({ draft, draftDir, state, picks, files, refresh: has("refresh"), log });

  await writeFile(draftPath, JSON.stringify(draft, null, 2) + "\n", "utf8");
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");

  log("\n자리별 사진:");
  for (const s of slots) {
    const st = state.slots[s.slot];
    const cands = state.queries[s.query]?.candidates ?? [];
    if (st.file) log(`  ${s.slot.padEnd(18)} 직접 올림 (${st.credit})`);
    else if (st.pick) {
      const n = cands.findIndex((c) => c.key === st.pick) + 1;
      const c = findCandidate(state, st.pick)!;
      log(`  ${s.slot.padEnd(18)} ${n}/${cands.length}  photo | ${c.author} / ${c.source === "unsplash" ? "Unsplash" : "Pexels"}`);
    } else log(`  ${s.slot.padEnd(18)} (없음)`);
  }
  if (empty.length) log(`\n확인할 점: 후보가 모자라 비어 있는 자리 — ${empty.join(", ")} (대체 배경으로 렌더링됨)`);

  if (!has("no-sheet")) {
    const rows: SheetRow[] = [...new Set(slots.map((s) => s.query))].map((query) => {
      const usedBy: Record<string, string[]> = {};
      for (const s of slots) {
        const pick = state.slots[s.slot].pick;
        if (s.query === query && pick) (usedBy[pick] ??= []).push(s.slot);
      }
      return { query, candidates: state.queries[query]?.candidates ?? [], usedBy };
    });
    const uploads = slots
      .filter((s) => state.slots[s.slot].file)
      .map((s) => ({
        label: s.slot,
        src: pathToFileURL(path.join(draftDir, "photos", state.slots[s.slot].file!)).href,
        credit: state.slots[s.slot].credit ?? "",
      }));
    const sheet = path.join(draftDir, "photos.png");
    try {
      await renderSheet(rows, uploads, sheet);
      log(`\n후보 시트 → ${path.relative(process.cwd(), sheet)}`);
    } catch (err) {
      log(`\n(후보 시트를 만들지 못했습니다: ${(err as Error).message})`);
    }
  }

  log(`원고 갱신 → ${path.relative(process.cwd(), draftPath)}`);
  log(`\n다음: npm run render -- ${path.relative(process.cwd(), draftPath)}`);
});

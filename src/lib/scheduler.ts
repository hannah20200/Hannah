/**
 * 예약 게시 스케줄러: 1분마다 시간이 된 예약을 게시한다.
 * Next.js 서버가 켜질 때 instrumentation.ts에서 시작된다 (공개 이미지 URL도 같은 서버가 제공).
 */
import { configFromEnv } from "./instagram";
import { runDue } from "./publish";

const INTERVAL_MS = 60_000;
const g = globalThis as typeof globalThis & { __smmScheduler?: NodeJS.Timeout; __smmRunning?: boolean };

export function startScheduler() {
  if (g.__smmScheduler) return;
  const { missing } = configFromEnv();
  if (missing.length) {
    console.log(`[scheduler] Instagram 설정이 없어 예약 게시를 끕니다 (${missing.join(", ")})`);
    return;
  }
  const tick = async () => {
    if (g.__smmRunning) return;
    g.__smmRunning = true;
    try {
      for (const r of await runDue()) {
        console.log(`[scheduler] ${r.id}: ${r.ok ? "게시 완료" : `실패 — ${r.error}`}`);
      }
    } catch (err) {
      console.error("[scheduler]", err);
    } finally {
      g.__smmRunning = false;
    }
  };
  g.__smmScheduler = setInterval(tick, INTERVAL_MS);
  void tick();
  console.log("[scheduler] 예약 게시 스케줄러 시작 (1분 간격)");
}

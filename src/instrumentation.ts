/** Next.js 서버 시작 시 1회: 예약 게시 스케줄러 (SCHEDULER=off 로 끌 수 있음) */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.SCHEDULER !== "off") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}

/**
 * Instagram 게시·예약
 *   npm run publish -- <id> --cover A --at "2026-10-15 20:00"   예약 (이 컴퓨터 시간 기준)
 *   npm run publish -- <id> --cover A --now                      지금 게시
 *   npm run publish -- <id> --cancel                             예약 취소
 *   npm run publish:due                                          시간이 된 예약 게시 (cron용)
 *
 * 게시할 때 Instagram이 PUBLIC_BASE_URL에서 이미지를 가져가므로, 웹 서버(npm run dev/start)와
 * 공개 주소(터널 등)가 켜져 있어야 한다.
 */
import { runDue, publishPost, schedulePost } from "../lib/publish";
import { deletePublish, readPublish } from "../lib/store";
import { flag, has, log, positional, runCli } from "./common";

runCli(async () => {
  if (has("due")) {
    const results = await runDue(new Date(), { log });
    if (results.length === 0) log("게시할 예약이 없습니다");
    for (const r of results) log(`${r.id}: ${r.ok ? "게시 완료" : `실패 — ${r.error}`}`);
    if (results.some((r) => !r.ok)) process.exitCode = 1;
    return;
  }

  const [id] = positional();
  if (!id) throw new Error('사용법: npm run publish -- <게시물 id> --cover A (--at "2026-10-15 20:00" | --now | --cancel)');

  if (has("cancel")) {
    const s = await readPublish(id);
    if (s?.status === "publishing" || s?.status === "published") throw new Error(`취소할 수 없는 상태입니다: ${s.status}`);
    await deletePublish(id);
    log("예약을 취소했습니다");
    return;
  }

  const cover = (flag("cover") ?? "A").toUpperCase();
  if (cover !== "A" && cover !== "B") throw new Error("--cover는 A 또는 B");

  if (has("now")) {
    await schedulePost(id, cover, new Date());
    const s = await publishPost(id, { log });
    log(`게시 완료: ${s.permalink ?? s.media_id}`);
    return;
  }

  const atText = flag("at");
  if (!atText) throw new Error('--at "YYYY-MM-DD HH:mm" 또는 --now 가 필요합니다');
  const at = new Date(atText.replace(" ", "T"));
  if (Number.isNaN(at.getTime())) throw new Error(`시각을 읽을 수 없습니다: ${atText}`);
  if (at.getTime() < Date.now()) throw new Error("지난 시각으로는 예약할 수 없습니다");
  const s = await schedulePost(id, cover, at);
  log(`예약: ${new Date(s.scheduled_at).toLocaleString("ko-KR")} · 표지 ${s.cover}`);
  log("웹 서버(npm run start)가 켜져 있으면 그 시각에 자동으로 게시됩니다. (또는 cron으로 npm run publish:due)");
});

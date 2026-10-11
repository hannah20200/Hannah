"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./client";
import { InstagramStatus } from "./instagram-status";
import { Button, ErrorBox } from "./ui";
import type { PublishState } from "@/lib/store";

/** datetime-local 기본값: 내일 저녁 8시 (로컬 시간) */
function defaultLocal(): string {
  const d = new Date(Date.now() + 86400000);
  d.setHours(20, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const fmt = (iso: string) => new Date(iso).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });

/** 미리보기 화면의 게시·예약 패널 */
export function PublishPanel({ id, initial, hasPngs }: { id: string; initial: PublishState | null; hasPngs: boolean }) {
  const [state, setState] = useState<PublishState | null>(initial);
  const [cover, setCover] = useState<"A" | "B">(initial?.cover ?? "A");
  const [at, setAt] = useState(defaultLocal);
  const [busy, setBusy] = useState<"now" | "schedule" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const onStatus = useCallback((ok: boolean) => setReady(ok), []);

  useEffect(() => setState(initial), [initial]);

  async function submit(kind: "now" | "schedule") {
    if (kind === "now" && !confirm(`표지 ${cover}로 지금 Instagram에 게시할까요?`)) return;
    setBusy(kind);
    setError(null);
    try {
      const body = kind === "now" ? { id, cover, now: true } : { id, cover, at: new Date(at).toISOString() };
      const r = await api<{ publish: PublishState }>("/api/publish", { method: "POST", json: body });
      setState(r.publish);
    } catch (e) {
      setError((e as Error).message);
      // 실패 상태도 서버에 기록되니 다시 읽는다
      api<{ publish?: PublishState }>(`/api/posts/${encodeURIComponent(id)}`)
        .then((p) => setState((p as { publish?: PublishState }).publish ?? null))
        .catch(() => {});
    } finally {
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      await api(`/api/publish?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      setState(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const published = state?.status === "published";
  return (
    <section className="space-y-4 rounded-2xl border border-line bg-paper p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-extrabold tracking-wide text-muted">Instagram 게시</h3>
        <span className="text-xs text-muted">표지 1장 + 본문 8장 = 9장 캐러셀 · JPEG로 변환해 올려요</span>
      </div>

      {state && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            state.status === "failed" ? "bg-red-50 text-red-800" : state.status === "published" ? "bg-green-50 text-green-900" : "bg-amber-50 text-amber-900"
          }`}
        >
          {state.status === "scheduled" && <>⏰ {fmt(state.scheduled_at)}에 표지 {state.cover}로 게시 예약됨 (앱 서버가 켜져 있어야 해요)</>}
          {state.status === "publishing" && <>게시하는 중… (표지 {state.cover})</>}
          {state.status === "failed" && <>게시 실패 ({state.attempts}회 시도): {state.error}</>}
          {state.status === "published" && (
            <>
              ✓ {state.published_at && fmt(state.published_at)}에 게시됨{" "}
              {state.permalink && (
                <a href={state.permalink} target="_blank" rel="noreferrer" className="font-bold underline">
                  Instagram에서 보기 ↗
                </a>
              )}
            </>
          )}
        </div>
      )}

      {!published && (
        <>
          <InstagramStatus onStatus={onStatus} />
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <div className="mb-1 text-xs font-bold text-muted">첫 장(표지)</div>
              <div className="flex gap-2">
                {(["A", "B"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCover(c)}
                    className={`rounded-full px-4 py-1.5 text-sm font-bold ${cover === c ? "bg-butter" : "border border-line text-muted"}`}
                  >
                    표지 {c}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <div className="mb-1 text-xs font-bold text-muted">예약 시각</div>
              <input
                type="datetime-local"
                value={at}
                onChange={(e) => setAt(e.target.value)}
                className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-ink"
              />
            </label>
            <div className="flex gap-2">
              <Button variant="butter" onClick={() => submit("schedule")} disabled={!hasPngs || busy !== null} busy={busy === "schedule"}>
                {state?.status === "scheduled" ? "예약 바꾸기" : "예약하기"}
              </Button>
              <Button onClick={() => submit("now")} disabled={!hasPngs || !ready || busy !== null} busy={busy === "now"}>
                {state?.status === "failed" ? "지금 다시 게시" : "지금 게시"}
              </Button>
              {(state?.status === "scheduled" || state?.status === "failed") && (
                <Button variant="ghost" onClick={cancel} disabled={busy !== null} busy={busy === "cancel"}>
                  예약 취소
                </Button>
              )}
            </div>
          </div>
          {!hasPngs && <p className="text-xs text-muted">PNG를 먼저 만들어 주세요. 게시에는 지금 만들어진 PNG가 그대로 쓰여요.</p>}
          <ErrorBox>{error}</ErrorBox>
        </>
      )}
    </section>
  );
}

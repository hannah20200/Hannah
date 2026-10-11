"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/app/_components/client";
import { Button, Card, ErrorBox, Loading } from "@/app/_components/ui";
import type { BoardCard } from "@/app/api/board/route";
import type { Idea } from "@/lib/store";
import { InstagramStatus } from "@/app/_components/instagram-status";

type Board = { cards: BoardCard[]; ideas: Idea[] };

const COLUMNS: { key: string; label: string; stages: BoardCard["stage"][]; hint: string }[] = [
  { key: "writing", label: "작업 중", stages: ["writing"], hint: "원고·사진 단계" },
  { key: "ready", label: "게시 준비", stages: ["ready"], hint: "PNG 완성, 예약 전" },
  { key: "scheduled", label: "예약", stages: ["scheduled", "publishing", "failed"], hint: "시간이 되면 자동 게시" },
  { key: "published", label: "게시됨", stages: ["published"], hint: "" },
];

const STEP_PATH: Record<BoardCard["stage"], string> = {
  writing: "draft",
  ready: "preview",
  scheduled: "preview",
  publishing: "preview",
  failed: "preview",
  published: "preview",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export default function BoardPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idea, setIdea] = useState("");

  const load = useCallback(async () => {
    try {
      setBoard(await api<Board>("/api/board"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function addIdea() {
    if (!idea.trim()) return;
    const r = await api<{ ideas: Idea[] }>("/api/ideas", { method: "POST", json: { text: idea } });
    setBoard((b) => (b ? { ...b, ideas: r.ideas } : b));
    setIdea("");
  }
  async function removeIdea(id: string) {
    const r = await api<{ ideas: Idea[] }>(`/api/ideas?id=${id}`, { method: "DELETE" });
    setBoard((b) => (b ? { ...b, ideas: r.ideas } : b));
  }
  async function cancel(id: string) {
    if (!confirm("예약을 취소할까요?")) return;
    try {
      await api(`/api/publish?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (error && !board) return <ErrorBox>{error}</ErrorBox>;
  if (!board) return <Loading />;

  // 앞으로 2주 달력
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 14 }, (_, i) => new Date(today.getTime() + i * 86400000));
  const byDay = new Map<string, BoardCard[]>();
  for (const c of board.cards) {
    const when = c.publish?.status === "published" ? c.publish.published_at : c.publish?.scheduled_at;
    if (!when) continue;
    const k = dayKey(new Date(when));
    byDay.set(k, [...(byDay.get(k) ?? []), c]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">콘텐츠 보드</h1>
          <p className="mt-1 text-sm text-muted">아이디어부터 게시까지 한눈에. 예약은 앱 서버가 켜져 있을 때 시간에 맞춰 올라가요.</p>
        </div>
        <Link href="/" className="rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-black">
          + 새 게시물
        </Link>
      </div>
      <ErrorBox>{error}</ErrorBox>

      <InstagramStatus />

      <Card title="앞으로 2주">
        <div className="grid grid-cols-7 gap-2">
          {days.map((d) => {
            const items = byDay.get(dayKey(d)) ?? [];
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            return (
              <div key={d.toISOString()} className={`min-h-20 rounded-lg border p-2 ${items.length ? "border-butter bg-butter/20" : "border-line bg-white/60"}`}>
                <div className={`text-xs font-bold ${weekend ? "text-red-700/70" : "text-muted"}`}>
                  {d.getMonth() + 1}/{d.getDate()} {"일월화수목금토"[d.getDay()]}
                </div>
                {items.map((c) => (
                  <Link key={c.id} href={`/posts/${c.id}/preview`} className="mt-1 block truncate text-[11px] font-bold hover:underline">
                    {new Date((c.publish?.status === "published" ? c.publish.published_at : c.publish?.scheduled_at)!).toLocaleTimeString("ko-KR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    {c.title}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-5">
        <section className="rounded-2xl border border-line bg-paper p-4">
          <h2 className="mb-1 font-extrabold">아이디어</h2>
          <p className="mb-3 text-xs text-muted">떠오른 주제를 적어 두고, 레퍼런스를 찾으면 시작</p>
          <div className="flex gap-2">
            <input
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && addIdea()}
              placeholder="예: 겨울 니트 고르는 기준"
              className="min-w-0 flex-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm outline-none focus:border-ink"
            />
            <Button variant="butter" className="!px-3 !py-1.5" onClick={addIdea}>
              추가
            </Button>
          </div>
          <ul className="mt-3 space-y-2">
            {board.ideas.map((i) => (
              <li key={i.id} className="rounded-lg border border-line bg-white p-2.5 text-sm">
                <div className="font-bold">{i.text}</div>
                <div className="mt-1.5 flex justify-between text-xs">
                  <Link href={`/?topic=${encodeURIComponent(i.text)}`} className="font-bold text-ink underline-offset-2 hover:underline">
                    이걸로 시작 →
                  </Link>
                  <button onClick={() => removeIdea(i.id)} className="text-muted hover:text-red-600">
                    지우기
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {COLUMNS.map((col) => {
          const cards = board.cards.filter((c) => col.stages.includes(c.stage));
          if (col.key === "scheduled") cards.sort((a, b) => (a.publish?.scheduled_at ?? "").localeCompare(b.publish?.scheduled_at ?? ""));
          return (
            <section key={col.key} className="rounded-2xl border border-line bg-paper p-4">
              <h2 className="font-extrabold">
                {col.label} <span className="text-muted">{cards.length}</span>
              </h2>
              <p className="mb-3 text-xs text-muted">{col.hint}</p>
              <ul className="space-y-3">
                {cards.map((c) => (
                  <li key={c.id} className="overflow-hidden rounded-xl border border-line bg-white">
                    <Link href={`/posts/${c.id}/${STEP_PATH[c.stage]}`} className="block hover:opacity-80">
                      {c.thumb ? (
                        <img src={c.thumb} alt="" className="aspect-[4/5] w-full object-cover" />
                      ) : (
                        <div className="flex aspect-[4/5] w-full items-center justify-center bg-cream text-xs text-muted">사진 전</div>
                      )}
                      <div className="p-2.5">
                        <div className="line-clamp-2 text-sm font-bold">{c.title}</div>
                        {c.publish?.status === "scheduled" && <div className="mt-1 text-xs font-bold text-amber-700">⏰ {fmt(c.publish.scheduled_at)}</div>}
                        {c.publish?.status === "publishing" && <div className="mt-1 text-xs font-bold text-amber-700">게시 중…</div>}
                        {c.publish?.status === "failed" && <div className="mt-1 line-clamp-2 text-xs font-bold text-red-700">실패: {c.publish.error}</div>}
                        {c.publish?.status === "published" && c.publish.published_at && <div className="mt-1 text-xs text-muted">{fmt(c.publish.published_at)}</div>}
                      </div>
                    </Link>
                    {(c.publish?.status === "scheduled" || c.publish?.status === "failed") && (
                      <button onClick={() => cancel(c.id)} className="w-full border-t border-line py-1.5 text-xs text-muted hover:text-red-600">
                        예약 취소
                      </button>
                    )}
                    {c.publish?.permalink && (
                      <a href={c.publish.permalink} target="_blank" rel="noreferrer" className="block border-t border-line py-1.5 text-center text-xs font-bold hover:underline">
                        Instagram에서 보기 ↗
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

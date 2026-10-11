"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, photoUrl, usePost, type PostData } from "@/app/_components/client";
import { Button, Card, ErrorBox, Loading, Notice, Working } from "@/app/_components/ui";
import type { Photo } from "@/lib/schema";
import type { Draft } from "@/lib/schema";

type MatchResponse = Pick<PostData, "draft" | "photoState" | "slots"> & { empty: string[] };

/** 원고에서 자리별 현재 사진 */
function currentPhoto(draft: Draft, slot: string): Photo | undefined {
  const [kind, a, b] = slot.split(".");
  if (kind === "cover") {
    const c = draft.covers.find((x) => x.variant === a);
    return b ? c?.collage?.[Number(b.replace("collage", "")) - 1] : c?.photo;
  }
  if (kind === "intro") return draft.intro[Number(a) - 1]?.photo;
  if (kind === "item") return draft.items[Number(a) - 1]?.photo;
  return draft.end.photo;
}

export default function PhotosPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { post, setPost, error } = usePost(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [empty, setEmpty] = useState<string[]>([]);

  async function run(label: string, call: () => Promise<MatchResponse>) {
    setBusy(label);
    setActionError(null);
    try {
      const r = await call();
      setPost((p) => (p ? { ...p, draft: r.draft, photoState: r.photoState, slots: r.slots } : p));
      setEmpty(r.empty);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const match = (body: { picks?: Record<string, number>; refresh?: boolean } = {}, label = "match") =>
    run(label, () => api<MatchResponse>("/api/photos/match", { method: "POST", json: { id, ...body } }));

  const upload = (slot: string, file: File) => {
    const credit = window.prompt("사진 크레딧 (비워두면 ‘직접 촬영’)", "") ?? "";
    const form = new FormData();
    form.append("id", id);
    form.append("slot", slot);
    form.append("file", file);
    form.append("credit", credit);
    return run(slot, () => api<MatchResponse>("/api/photos/upload", { method: "POST", body: form }));
  };

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!post) return <Loading />;
  if (!post.draft) return <ErrorBox>원고가 없어요. 원고 단계부터 진행해 주세요.</ErrorBox>;
  if (busy === "match" || busy === "refresh") {
    return <Working label="사진을 찾고 있어요" hint="Unsplash에서 먼저 찾고, 모자라면 Pexels에서 채워요 · 처음엔 20초쯤 걸려요" />;
  }

  const draft = post.draft;
  const state = post.photoState;
  // 원고에서 검색어를 고친 자리
  const stale = state ? post.slots.filter((s) => state.slots[s.slot] && state.slots[s.slot].query !== s.query && !state.slots[s.slot].file) : [];
  const unmatched = state ? post.slots.filter((s) => !state.slots[s.slot]) : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">사진</h1>
          <p className="mt-1 text-sm text-muted">
            밝은 낮의 자연광, 스타일 있는 인물 중심으로 골라 주세요. 글자가 박힌 사진·유명인 얼굴은 자동으로 다 걸러지지 않아요.
          </p>
        </div>
        <div className="flex gap-2">
          {state && (
            <Button variant="ghost" onClick={() => confirm("검색 결과를 버리고 다시 찾을까요? (직접 고른 사진도 다시 배정돼요)") && match({ refresh: true }, "refresh")}>
              전부 다시 검색
            </Button>
          )}
          <Button onClick={() => router.push(`/posts/${id}/preview`)} disabled={busy !== null}>
            다음: 미리보기 →
          </Button>
        </div>
      </div>

      <ErrorBox>{actionError}</ErrorBox>
      {empty.length > 0 && <Notice>후보가 모자라 비어 있는 자리: {empty.join(", ")} — 검색어를 바꾸거나 직접 올려 주세요. (비어 있으면 대체 배경으로 나와요)</Notice>}

      {!state ? (
        <Card>
          <p className="mb-4 text-sm text-muted">
            각 장의 사진 검색어로 후보를 찾아 자동으로 배정해요. 한 게시물 안에서 같은 사진은 두 번 쓰지 않고, 크레딧(photo | 작가명 / Unsplash)은 자동으로 들어가요.
          </p>
          <Button onClick={() => match()}>사진 자동 매칭</Button>
          <p className="mt-3 text-xs text-muted">.env.local에 UNSPLASH_ACCESS_KEY 또는 PEXELS_API_KEY가 필요해요.</p>
        </Card>
      ) : (
        (stale.length > 0 || unmatched.length > 0) && (
          <Notice>
            원고에서 검색어가 바뀐 자리가 있어요: {[...stale, ...unmatched].map((s) => s.label).join(", ")}
            <div className="mt-2">
              <Button variant="butter" onClick={() => match()}>
                바뀐 자리만 다시 찾기
              </Button>
            </div>
          </Notice>
        )
      )}

      <div className="space-y-4">
        {post.slots.map((s) => {
          const photo = currentPhoto(draft, s.slot);
          const st = state?.slots[s.slot];
          const cands = state?.queries[st?.query ?? s.query]?.candidates ?? [];
          const usedBy = new Map<string, string>();
          if (state) for (const o of post.slots) if (o.slot !== s.slot && state.slots[o.slot]?.pick) usedBy.set(state.slots[o.slot].pick!, o.label);
          return (
            <section key={s.slot} className={`rounded-2xl border border-line bg-paper p-4 ${busy === s.slot ? "opacity-50" : ""}`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <span className="font-extrabold">{s.label}</span>
                  <span className="ml-2 font-mono text-xs text-muted">{s.query}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted">
                  {photo ? <span>photo | {photo.credit}</span> : <span className="text-red-600">사진 없음</span>}
                  <label className="cursor-pointer rounded-full border border-line px-3 py-1 font-bold text-ink hover:bg-white">
                    직접 올리기
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={busy !== null}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (f) void upload(s.slot, f);
                      }}
                    />
                  </label>
                </div>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                <div className="shrink-0">
                  <div className="h-40 w-32 overflow-hidden rounded-lg border-2 border-ink bg-cream">
                    {photo && <img src={photoUrl(id, photo.src)} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="mt-1 text-center text-[11px] font-bold">지금 사진</div>
                </div>
                <div className="w-px shrink-0 bg-line" />
                {cands.map((c, i) => {
                  const selected = st?.pick === c.key;
                  const other = usedBy.get(c.key);
                  return (
                    <button
                      key={c.key}
                      disabled={busy !== null || selected}
                      onClick={() => match({ picks: { [s.slot]: i + 1 } }, s.slot)}
                      title={`${c.author} / ${c.source} · ${c.width}×${c.height}${c.description ? `\n${c.description}` : ""}`}
                      className="group shrink-0 text-left"
                    >
                      <div className={`relative h-40 w-32 overflow-hidden rounded-lg border-2 ${selected ? "border-butter" : "border-transparent group-hover:border-line"}`}>
                        <img src={c.thumb} alt="" loading="lazy" className={`size-full object-cover ${other ? "opacity-50" : ""}`} />
                        <span className="absolute left-1 top-1 rounded-full bg-ink/75 px-1.5 text-[11px] font-bold text-white">{i + 1}</span>
                      </div>
                      <div className="mt-1 w-32 truncate text-[11px] text-muted">{other ? `${other}에서 사용 중` : `${c.author} · ${c.source === "unsplash" ? "Unsplash" : "Pexels"}`}</div>
                    </button>
                  );
                })}
                {state && cands.length === 0 && <div className="self-center text-sm text-muted">후보 없음 — 원고에서 검색어를 바꾸거나 직접 올려 주세요</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

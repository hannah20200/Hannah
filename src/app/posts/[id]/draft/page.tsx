"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api, usePost } from "@/app/_components/client";
import { cleanLines, LinesField, TextField } from "@/app/_components/fields";
import { browserDraft, SlidePreview } from "@/app/_components/slide-preview";
import { Button, Card, ErrorBox, Loading, Notice, Spinner } from "@/app/_components/ui";
import { findOverlaps, type Overlap } from "@/lib/overlap";
import type { Category, Draft } from "@/lib/schema";
import { Cover } from "@/templates/Cover";
import { End } from "@/templates/End";
import { Page } from "@/templates/Page";

const CATEGORIES: { value: Category | undefined; label: string }[] = [
  { value: "READ", label: "READ 읽다" },
  { value: "BUY", label: "BUY 사다" },
  { value: "WEAR", label: "WEAR 입다" },
  { value: undefined, label: "해당 없음" },
];

/** 저장 전 정리: 빈 줄 제거, 해시태그 # 붙이기 */
function normalize(d: Draft): Draft {
  return {
    ...d,
    covers: d.covers.map((c) => ({ ...c, title: cleanLines(c.title) })),
    intro: d.intro.map((s) => ({ ...s, body: cleanLines(s.body), key: cleanLines(s.key) })),
    items: d.items.map((s) => ({ ...s, body: cleanLines(s.body), key: cleanLines(s.key) })),
    end: { ...d.end, lines: cleanLines(d.end.lines) },
    hashtags: d.hashtags.map((h) => h.trim()).filter(Boolean).map((h) => (h.startsWith("#") ? h : `#${h}`)),
  };
}

export default function DraftPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { post, error } = usePost(id);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rewriting, setRewriting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "notice"; text: string } | null>(null);

  useEffect(() => {
    if (post?.draft && !draft) setDraft(post.draft);
  }, [post, draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const preview = useMemo(() => (draft ? browserDraft(id, draft) : null), [id, draft]);
  const overlaps: Overlap[] = useMemo(
    () => (draft && post?.analysis ? findOverlaps(draft.items.map((i) => i.head), post.analysis.items_to_avoid) : []),
    [draft, post?.analysis],
  );

  function edit(fn: (d: Draft) => void) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    if (!draft) return false;
    setSaving(true);
    setMessage(null);
    try {
      const r = await api<{ draft: Draft }>("/api/draft", { method: "PUT", json: { id, draft: normalize(draft) } });
      setDraft(r.draft);
      setDirty(false);
      return true;
    } catch (e) {
      setMessage({ kind: "error", text: `저장하지 못했어요:\n${(e as Error).message}` });
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function rewrite(target: string, note: string) {
    if (dirty && !(await save())) return;
    setRewriting(target);
    setMessage(null);
    try {
      const r = await api<{ draft: Draft; overlaps: Overlap[] }>("/api/draft/rewrite", { method: "POST", json: { id, target, note } });
      setDraft(r.draft);
      setDirty(false);
      if (r.overlaps.length) setMessage({ kind: "notice", text: `다시 썼지만 레퍼런스와 비슷한 제목이 남았어요: ${r.overlaps.map((o) => o.head).join(", ")}` });
    } catch (e) {
      setMessage({ kind: "error", text: (e as Error).message });
    } finally {
      setRewriting(null);
    }
  }

  async function next() {
    if (dirty && !(await save())) return;
    router.push(`/posts/${id}/photos`);
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!post) return <Loading />;
  if (!post.draft || !draft || !preview) {
    return (
      <Card>
        <p className="mb-4 text-muted">아직 원고가 없어요. 분석 화면에서 원고를 만들어 주세요.</p>
        <Button onClick={() => router.push(`/posts/${id}/analyze`)}>분석 화면으로</Button>
      </Card>
    );
  }

  const busy = rewriting !== null;
  const slideProps = { busy, rewriting, onRewrite: rewrite };

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-6 flex flex-wrap items-center justify-between gap-3 border-b border-line bg-cream/95 px-6 py-3 backdrop-blur">
        <div>
          <h1 className="text-2xl font-extrabold">원고</h1>
          <p className="text-sm text-muted">제목은 반말·구어체, 본문은 부드러운 존댓말. 미리보기는 고치는 대로 바뀌어요.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">{saving ? "저장 중…" : dirty ? "저장 안 됨" : "저장됨"}</span>
          <Button variant="ghost" onClick={save} disabled={!dirty || busy} busy={saving}>
            저장
          </Button>
          <Button onClick={next} disabled={busy}>
            다음: 사진 →
          </Button>
        </div>
      </div>

      {message && (message.kind === "error" ? <ErrorBox>{message.text}</ErrorBox> : <Notice>{message.text}</Notice>)}
      {overlaps.length > 0 && (
        <Notice>
          레퍼런스 항목과 비슷한 제목이 있어요 — 다시 쓰기를 권해요:
          {overlaps.map((o) => `\n· "${o.head}" ↔ "${o.reference}" (유사도 ${o.score})`).join("")}
        </Notice>
      )}
      {draft.self_check.notes && <p className="text-xs text-muted">겹침 점검: {draft.self_check.notes}</p>}

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-paper px-5 py-4">
        <span className="text-sm font-extrabold">이 게시물의 카테고리</span>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.label}
              onClick={() => edit((d) => void (d.category = c.value))}
              className={`rounded-full px-3 py-1 text-xs font-bold ${draft.category === c.value ? "bg-butter text-ink" : "border border-line text-muted"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">계정 전체 분류예요. 고르면 항목 장 위쪽에 라벨로 표시돼요.</span>
      </section>

      {[...draft.covers]
        .map((c, i) => ({ c, i }))
        .sort((a, b) => a.c.variant.localeCompare(b.c.variant))
        .map(({ c, i }) => (
          <SlideRow
            key={`cover-${c.variant}`}
            title={`표지 ${c.variant}`}
            target={`cover.${c.variant}`}
            preview={<Cover data={preview.covers[i]} />}
            deps={c}
            {...slideProps}
          >
            <TextField label="상단 한 줄 (속마음)" value={c.top_line} onChange={(v) => edit((d) => void (d.covers[i].top_line = v))} />
            <LinesField label="제목 (2줄, 반말·구어체)" value={c.title} min={1} max={2} onChange={(v) => edit((d) => void (d.covers[i].title = v))} />
            <TextField label="부제 (숫자는 여기에)" value={c.sub} onChange={(v) => edit((d) => void (d.covers[i].sub = v))} />
            <TextField label="사진 검색어 (영어)" mono value={c.photo_query} onChange={(v) => edit((d) => void (d.covers[i].photo_query = v))} />
          </SlideRow>
        ))}

      {draft.intro.map((s, i) => (
        <SlideRow key={`intro-${i}`} title="도입" target={`intro.${i + 1}`} preview={<Page kind="intro" data={preview.intro[i]} />} deps={s} {...slideProps}>
          <LinesField label="본문 (존댓말)" value={s.body} min={2} max={3} onChange={(v) => edit((d) => void (d.intro[i].body = v))} />
          <LinesField label="굵은 밑줄 문장" value={s.key} min={1} max={2} onChange={(v) => edit((d) => void (d.intro[i].key = v))} />
          <TextField label="사진 검색어 (영어)" mono value={s.photo_query} onChange={(v) => edit((d) => void (d.intro[i].photo_query = v))} />
        </SlideRow>
      ))}

      {draft.items.map((s, i) => (
        <SlideRow key={`item-${i}`} title={`항목 ${i + 1}`} target={`item.${i + 1}`} preview={<Page kind="item" data={preview.items[i]} label={draft.category} />} deps={s} {...slideProps}>
          <TextField label="항목 제목" value={s.head} onChange={(v) => edit((d) => void (d.items[i].head = v))} />
          <LinesField label="본문 (2줄, 존댓말)" value={s.body} min={1} max={3} onChange={(v) => edit((d) => void (d.items[i].body = v))} />
          <LinesField label="굵은 밑줄 문장" value={s.key} min={1} max={1} onChange={(v) => edit((d) => void (d.items[i].key = v))} />
          <TextField label="PICK (‘PICK · ’로 시작)" value={s.pick} onChange={(v) => edit((d) => void (d.items[i].pick = v))} />
          <TextField label="사진 검색어 (영어)" mono value={s.photo_query} onChange={(v) => edit((d) => void (d.items[i].photo_query = v))} />
        </SlideRow>
      ))}

      <SlideRow title="마무리" target="end" preview={<End data={preview.end} />} deps={draft.end} {...slideProps}>
        <LinesField label="질문 (1~2줄)" value={draft.end.lines} min={1} max={2} onChange={(v) => edit((d) => void (d.end.lines = v))} />
        <TextField label="저장 유도 한 줄" value={draft.end.cta} onChange={(v) => edit((d) => void (d.end.cta = v))} />
        <TextField label="사진 검색어 (영어)" mono value={draft.end.photo_query ?? ""} onChange={(v) => edit((d) => void (d.end.photo_query = v))} />
      </SlideRow>

      <Card title="캡션 · 해시태그">
        <textarea
          value={draft.caption}
          onChange={(e) => edit((d) => void (d.caption = e.target.value))}
          rows={8}
          className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <input
          value={draft.hashtags.join(" ")}
          onChange={(e) => edit((d) => void (d.hashtags = e.target.value.split(/\s+/)))}
          className="mt-3 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink"
        />
        <p className="mt-1 text-xs text-muted">해시태그는 띄어쓰기로 구분 · {draft.hashtags.filter(Boolean).length}개</p>
      </Card>
    </div>
  );
}

function SlideRow({
  title,
  target,
  preview,
  deps,
  children,
  busy,
  rewriting,
  onRewrite,
}: {
  title: string;
  target: string;
  preview: ReactNode;
  deps: unknown;
  children: ReactNode;
  busy: boolean;
  rewriting: string | null;
  onRewrite: (target: string, note: string) => void;
}) {
  const [note, setNote] = useState("");
  const mine = rewriting === target;
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-paper p-5 md:flex-row">
      <div className={`relative ${mine ? "opacity-40" : ""}`}>
        <SlidePreview width={270} deps={deps}>
          {preview}
        </SlidePreview>
        {mine && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Spinner />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-extrabold">{title}</h2>
        </div>
        {children}
        <div className="flex gap-2 border-t border-line pt-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="다시 쓰기 요청 (선택) 예: 더 짧고 위트 있게"
            className="min-w-0 flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-ink"
          />
          <Button variant="butter" onClick={() => onRewrite(target, note)} disabled={busy} busy={mine}>
            다시 쓰기
          </Button>
        </div>
      </div>
    </section>
  );
}

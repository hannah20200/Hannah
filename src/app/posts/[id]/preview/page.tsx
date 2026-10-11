"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, fileUrl, usePost } from "@/app/_components/client";
import { Button, Card, ErrorBox, Loading, Notice, Working } from "@/app/_components/ui";

type Slide = { name: string; url: string };

const LABEL = (name: string) => name.replace(/^\d+_/, "");

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { post, error } = usePost(id);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (post && slides === null) {
      setSlides(post.rendered.map((f) => ({ name: f.replace(/\.png$/, ""), url: `${fileUrl(id, f, "out")}&v=${Date.now()}` })));
    }
  }, [post, slides, id]);

  useEffect(() => {
    if (open === null || !slides) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : Math.min(slides.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, slides]);

  async function render() {
    setBusy(true);
    setActionError(null);
    try {
      const r = await api<{ slides: Slide[]; warnings: string[] }>("/api/render", { method: "POST", json: { id } });
      setSlides(r.slides);
      setWarnings(r.warnings);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!post) return <Loading />;
  if (!post.draft) return <ErrorBox>원고가 없어요. 원고 단계부터 진행해 주세요.</ErrorBox>;
  if (busy) return <Working label="PNG를 만들고 있어요" hint="1080×1350 · 10장 · 10초쯤 걸려요" />;

  const draft = post.draft;
  const hashtags = draft.hashtags.join(" ");
  const has = slides && slides.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">미리보기 · 내보내기</h1>
          <p className="mt-1 text-sm text-muted">표지는 A/B 두 가지예요. 올릴 때 하나를 첫 장으로 쓰세요. 원고·사진을 고쳤다면 다시 만들어 주세요.</p>
        </div>
        <div className="flex gap-2">
          <Button variant={has ? "ghost" : "primary"} onClick={render}>
            {has ? "PNG 다시 만들기" : "PNG 만들기"}
          </Button>
          {has && (
            <a href={`/api/export?id=${encodeURIComponent(id)}`} className="inline-flex items-center rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-white hover:bg-black">
              zip 다운로드
            </a>
          )}
        </div>
      </div>

      <ErrorBox>{actionError}</ErrorBox>
      {warnings.length > 0 && <Notice>확인할 점:{warnings.map((w) => `\n· ${w}`).join("")}</Notice>}

      {has ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {slides.map((s, i) => (
            <button key={s.name} onClick={() => setOpen(i)} className="group text-left">
              <img src={s.url} alt={s.name} className="aspect-[4/5] w-full rounded-lg shadow-sm transition group-hover:shadow-lg" />
              <div className="mt-1 text-xs font-bold text-muted">{LABEL(s.name)}</div>
            </button>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-sm text-muted">아직 만든 PNG가 없어요. ‘PNG 만들기’를 눌러 주세요.</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[1fr_320px]">
        <Card
          title="캡션"
          aside={
            <div className="flex gap-2">
              <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => copy("caption", draft.caption)}>
                {copied === "caption" ? "복사됨" : "캡션 복사"}
              </Button>
              <Button variant="butter" className="!px-3 !py-1.5 !text-xs" onClick={() => copy("all", `${draft.caption}\n\n${hashtags}`)}>
                {copied === "all" ? "복사됨" : "캡션+해시태그 복사"}
              </Button>
            </div>
          }
        >
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{draft.caption}</p>
        </Card>
        <Card
          title="해시태그"
          aside={
            <Button variant="ghost" className="!px-3 !py-1.5 !text-xs" onClick={() => copy("tags", hashtags)}>
              {copied === "tags" ? "복사됨" : "복사"}
            </Button>
          }
        >
          <p className="text-sm leading-relaxed text-muted">{hashtags}</p>
        </Card>
      </div>

      {open !== null && slides && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setOpen(null)}>
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20 disabled:opacity-20"
            disabled={open === 0}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(open - 1);
            }}
            aria-label="이전"
          >
            ‹
          </button>
          <figure onClick={(e) => e.stopPropagation()} className="flex max-h-full flex-col items-center">
            <img src={slides[open].url} alt={slides[open].name} className="max-h-[85vh] w-auto rounded-lg" />
            <figcaption className="mt-2 text-sm text-white/80">
              {open + 1} / {slides.length} · {LABEL(slides[open].name)}
            </figcaption>
          </figure>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20 disabled:opacity-20"
            disabled={open === slides.length - 1}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(open + 1);
            }}
            aria-label="다음"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

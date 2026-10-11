"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { api, fileUrl, usePost } from "@/app/_components/client";
import { Button, Card, ErrorBox, Loading, Working } from "@/app/_components/ui";

const ROLE: Record<string, string> = { cover: "표지", intro: "도입", item: "항목", end: "마무리" };

export default function AnalyzePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { post, error, reload } = usePost(id);
  const [busy, setBusy] = useState<"draft" | "reanalyze" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function run(kind: "draft" | "reanalyze") {
    if (kind === "draft" && post?.draft && !confirm("이미 원고가 있어요. 새로 만들면 지금 원고를 덮어써요. 계속할까요?")) return;
    setBusy(kind);
    setActionError(null);
    try {
      if (kind === "draft") {
        await api("/api/draft", { method: "POST", json: { id } });
        router.push(`/posts/${id}/draft`);
        return;
      }
      await api("/api/analyze", { method: "POST", json: { id } });
      await reload();
    } catch (e) {
      setActionError((e as Error).message);
    }
    setBusy(null);
  }

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!post) return <Loading />;
  if (busy === "draft") return <Working label="원고를 쓰고 있어요" hint="표지 2종 · 도입 · 항목 6개 · 마무리 · 캡션 — 보통 1~2분 걸려요" />;
  if (busy === "reanalyze") return <Working label="다시 분석하고 있어요" hint="보통 30초~1분 걸려요" />;

  const a = post.analysis;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">레퍼런스 분석</h1>
          <p className="mt-1 text-muted">
            구성·감성·비주얼 톤만 가져오고, 항목 내용과 결론은 겹치지 않게 새로 써요.
            {post.meta.topic && <> 주제: <b className="text-ink">{post.meta.topic}</b></>}
          </p>
        </div>
        <div className="flex gap-2">
          {post.meta.refs.length > 0 && (
            <Button variant="ghost" onClick={() => run("reanalyze")}>
              다시 분석
            </Button>
          )}
          <Button onClick={() => run("draft")} disabled={!a}>
            {post.draft ? "원고 새로 만들기" : "이 분석으로 원고 만들기"} →
          </Button>
        </div>
      </div>
      <ErrorBox>{actionError}</ErrorBox>

      {post.meta.refs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {post.meta.refs.map((r, i) => (
            <img key={r} src={fileUrl(id, `refs/${r}`)} alt={`레퍼런스 ${i + 1}`} className="h-36 rounded-lg border border-line" />
          ))}
        </div>
      )}

      {!a ? (
        <Card>
          <p className="text-muted">
            {post.meta.refs.length ? "아직 분석 결과가 없어요. ‘다시 분석’을 눌러 주세요." : "샘플 게시물이라 레퍼런스 분석이 없어요. 원고 단계부터 둘러보세요."}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="핵심 메시지" className="md:col-span-2">
            <p className="text-lg font-bold">{a.theme}</p>
          </Card>
          <Card title="구성">
            <ol className="space-y-2 text-sm">
              {a.slides.map((s) => (
                <li key={s.index} className="flex gap-2">
                  <span className="w-14 shrink-0 font-bold text-muted">
                    {s.index}. {ROLE[s.role]}
                  </span>
                  <span>
                    {s.text}
                    <span className="block text-xs text-muted">{s.visual}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <div className="space-y-4">
            <Card title="톤">
              <p className="text-sm">{a.tone}</p>
            </Card>
            <Card title="비주얼">
              <p className="text-sm">{a.visual_style}</p>
            </Card>
          </div>
          <Card title="잘한 점">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {a.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Card>
          <Card title="우리 계정의 차별점">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {a.differentiation.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </Card>
          <Card title="겹치면 안 되는 항목" className="border-red-200">
            <ul className="flex flex-wrap gap-2 text-sm">
              {a.items_to_avoid.map((s, i) => (
                <li key={i} className="rounded-full bg-red-50 px-3 py-1 text-red-800">
                  {s}
                </li>
              ))}
            </ul>
          </Card>
          <Card title="레퍼런스의 결론 (같은 결론 금지)" className="border-red-200">
            <p className="text-sm">{a.conclusion}</p>
          </Card>
        </div>
      )}
    </div>
  );
}

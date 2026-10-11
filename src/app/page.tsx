"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type DragEvent } from "react";
import { api } from "./_components/client";
import { Button, Card, ErrorBox, Working } from "./_components/ui";
import type { PostSummary } from "@/lib/store";

const MAX = 10;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const STEP_LABEL: Record<PostSummary["step"], string> = { analysis: "분석", draft: "원고", photos: "사진", done: "완료" };
const STEP_PATH: Record<PostSummary["step"], string> = { analysis: "analyze", draft: "draft", photos: "photos", done: "preview" };

export default function Home() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [topic, setTopic] = useState("");
  const [owned, setOwned] = useState("");
  const [busy, setBusy] = useState<"analyze" | "sample" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [posts, setPosts] = useState<PostSummary[] | null>(null);

  useEffect(() => {
    api<{ posts: PostSummary[] }>("/api/posts").then((r) => setPosts(r.posts)).catch(() => setPosts([]));
  }, []);

  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter((f) => ACCEPT.includes(f.type));
    const tooBig = incoming.filter((f) => f.size > MAX_BYTES);
    const ok = incoming
      .filter((f) => f.size <= MAX_BYTES)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const next = [...files, ...ok].slice(0, MAX);
    setFiles(next);
    const msgs = [];
    if (tooBig.length) msgs.push(`5MB를 넘어서 뺀 이미지: ${tooBig.map((f) => f.name).join(", ")}`);
    if (files.length + ok.length > MAX) msgs.push(`캡처는 최대 ${MAX}장까지예요`);
    setError(msgs.join("\n") || null);
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= files.length) return;
    const next = [...files];
    [next[i], next[j]] = [next[j], next[i]];
    setFiles(next);
  }

  async function analyze() {
    setBusy("analyze");
    setError(null);
    try {
      const form = new FormData();
      files.forEach((f) => form.append("images", f));
      form.append("topic", topic);
      form.append("owned", owned);
      const { id } = await api<{ id: string }>("/api/analyze", { method: "POST", body: form });
      router.push(`/posts/${id}/analyze`);
    } catch (e) {
      const saved = (e as { data?: { id?: string } }).data?.id;
      setError(`${(e as Error).message}${saved ? "\n(올린 캡처는 저장됐어요. 오른쪽 목록에서 열어 ‘다시 분석’할 수 있어요)" : ""}`);
      setBusy(null);
      api<{ posts: PostSummary[] }>("/api/posts").then((r) => setPosts(r.posts)).catch(() => {});
    }
  }

  async function sample() {
    setBusy("sample");
    try {
      const { id } = await api<{ id: string }>("/api/posts", { method: "POST", json: { sample: true } });
      router.push(`/posts/${id}/draft`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  if (busy === "analyze") {
    return <Working label="레퍼런스를 분석하고 있어요" hint={`캡처 ${files.length}장 · 보통 30초~1분 걸려요`} />;
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold">새 게시물 만들기</h1>
          <p className="mt-1 text-muted">참고할 게시물 캡처를 올리면 구성과 감성만 가져와서, 우리 계정 톤의 새 캐러셀을 만들어요.</p>
        </div>

        <Card title="1. 레퍼런스 캡처 (1~10장, 순서대로)">
          <label
            onDragOver={(e: DragEvent) => e.preventDefault()}
            onDrop={(e: DragEvent) => {
              e.preventDefault();
              addFiles(e.dataTransfer.files);
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line bg-cream/60 px-4 py-8 text-center hover:border-butter"
          >
            <span className="font-bold">여기에 끌어다 놓거나 눌러서 고르기</span>
            <span className="text-sm text-muted">PNG · JPG · WEBP, 장당 5MB 이하 · 파일 이름 순서로 정렬돼요</span>
            <input type="file" multiple accept={ACCEPT.join(",")} className="hidden" onChange={(e) => e.target.files && addFiles(e.target.files)} />
          </label>

          {files.length > 0 && (
            <ol className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="group relative">
                  <img src={previews[i]} alt="" className="aspect-[4/5] w-full rounded-lg border border-line object-cover" />
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-ink/80 px-2 text-xs font-bold text-white">{i + 1}</span>
                  <div className="mt-1 flex justify-between text-xs">
                    <button className="px-1 text-muted hover:text-ink disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="앞으로">
                      ←
                    </button>
                    <button className="text-muted hover:text-red-600" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                      빼기
                    </button>
                    <button className="px-1 text-muted hover:text-ink disabled:opacity-30" disabled={i === files.length - 1} onClick={() => move(i, 1)} aria-label="뒤로">
                      →
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card title="2. 주제 메모 (선택)">
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 연말 전에 내 취향 정리하기"
            className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-ink"
          />
        </Card>

        <Card title="3. 직접 써본 책·제품 (선택, 한 줄에 하나)">
          <textarea
            value={owned}
            onChange={(e) => setOwned(e.target.value)}
            rows={4}
            placeholder={"예:\n무인양품 B5 노트\n『아무튼, 문구』"}
            className="w-full rounded-lg border border-line bg-white px-3 py-2 outline-none focus:border-ink"
          />
          <p className="mt-1 text-xs text-muted">원고에 상품·책 이름은 이 목록에 있는 것만 들어가요.</p>
        </Card>

        <ErrorBox>{error}</ErrorBox>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={analyze} disabled={files.length === 0 || busy !== null}>
            레퍼런스 분석하기
          </Button>
          <Button variant="ghost" onClick={sample} busy={busy === "sample"} disabled={busy !== null}>
            샘플 원고로 둘러보기
          </Button>
          <span className="text-xs text-muted">샘플은 API 키 없이 원고 수정·미리보기를 해볼 수 있어요</span>
        </div>
      </div>

      <aside>
        <Card title="만든 게시물">
          {posts === null ? (
            <p className="text-sm text-muted">불러오는 중…</p>
          ) : posts.length === 0 ? (
            <p className="text-sm text-muted">아직 없어요</p>
          ) : (
            <ul className="divide-y divide-line">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link href={`/posts/${p.id}/${STEP_PATH[p.step]}`} className="block py-2.5 hover:opacity-70">
                    <div className="line-clamp-1 font-bold">{p.title}</div>
                    <div className="text-xs text-muted">
                      {new Date(p.created_at).toLocaleDateString("ko-KR")} · {STEP_LABEL[p.step]}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  );
}

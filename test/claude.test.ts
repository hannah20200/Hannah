import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach } from "node:test";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { analyzeReference, generateDraft, rewriteSlide, setClientForTesting } from "../src/lib/claude";
import { similarity, findOverlaps } from "../src/lib/overlap";
import { DraftOutputBase, DraftOutputSchema, DraftSchema, type Analysis } from "../src/lib/schema";

// --- 가짜 Claude 클라이언트: 준비된 응답을 순서대로 돌려주고 요청을 기록 ---
type Call = Record<string, any>;
function fakeClient(responses: string[]) {
  const calls: Call[] = [];
  const client = {
    beta: {
      messages: {
        stream(params: Call) {
          // 요청 시점의 messages를 복사해 둔다 (이후 push 영향 제외)
          calls.push({ ...params, messages: structuredClone(params.messages) });
          const text = responses[calls.length - 1];
          if (text === undefined) throw new Error("응답이 더 준비되지 않음");
          return {
            finalMessage: async () => ({
              content: [{ type: "text", text }],
              stop_reason: "end_turn",
              stop_details: null,
              model: params.model,
            }),
          };
        },
      },
    },
  };
  return { client, calls };
}

const analysis: Analysis = {
  slides: [{ index: 1, role: "cover", text: "가을에 읽기 좋은 책", visual: "책과 커피" }],
  theme: "가을 독서",
  tone: "반말 제목",
  visual_style: "따뜻한 톤",
  strengths: ["구체적인 리스트"],
  items_to_avoid: ["퇴근 후 30분 산책하기", "주말 아침 필사하기"],
  conclusion: "작은 루틴이 나를 바꾼다",
  differentiation: ["선택을 돕는 PICK"],
};

// 샘플 원고에서 사진 필드를 뺀 = LLM 출력 형태
function sampleDraft() {
  const d = JSON.parse(readFileSync("samples/taste_check.json", "utf8"));
  for (const c of d.covers) delete c.photo, delete c.collage;
  for (const s of [...d.intro, ...d.items, d.end]) delete s.photo;
  return d;
}

beforeEach(() => {
  process.env.CLAUDE_MODEL = "claude-opus-5-5";
});

describe("schema", () => {
  it("샘플 원고는 렌더링 스키마와 LLM 출력 스키마를 모두 통과", () => {
    assert.ok(DraftSchema.safeParse(JSON.parse(readFileSync("samples/taste_check.json", "utf8"))).success);
    assert.ok(DraftOutputSchema.safeParse(sampleDraft()).success);
  });

  it("항목 수는 3~8개, 캐러셀 10장을 넘으면 안 된다", () => {
    const d = sampleDraft();
    const item = d.items[0];
    assert.ok(DraftOutputSchema.safeParse({ ...d, items: d.items.slice(0, 3) }).success, "3개 OK");
    assert.equal(DraftOutputSchema.safeParse({ ...d, items: d.items.slice(0, 2) }).success, false, "2개는 안 됨");
    // 표지1 + 도입1 + 항목7 + 마무리1 = 10장 OK
    assert.ok(DraftOutputSchema.safeParse({ ...d, items: Array(7).fill(item) }).success, "7개 + 도입 OK");
    // 항목 8개 + 도입 1 = 11장 → 안 됨, 도입 없이 8개 = 10장 OK
    const eight = DraftOutputSchema.safeParse({ ...d, items: Array(8).fill(item) });
    assert.equal(eight.success, false);
    assert.match(JSON.stringify(eight.error?.issues), /10장을 넘습니다/);
    assert.ok(DraftOutputSchema.safeParse({ ...d, intro: [], items: Array(8).fill(item) }).success, "도입 없이 8개 OK");
  });

  it("카테고리는 게시물 단위로 하나 (없어도 됨), 항목에는 붙이지 않는다", () => {
    const d = sampleDraft();
    assert.equal(DraftSchema.parse(d).category, undefined);
    assert.equal(DraftSchema.parse({ ...d, category: "WEAR" }).category, "WEAR");
    assert.equal(DraftSchema.safeParse({ ...d, category: "TRAVEL" }).success, false);
    // 예전 형식(항목마다 pillar)의 원고도 읽히고, pillar는 버려진다
    const legacy = { ...d, items: d.items.map((i: object) => ({ ...i, pillar: "READ" })) };
    const parsed = DraftSchema.parse(legacy);
    assert.ok(!("pillar" in parsed.items[0]));
  });

  it("구조화 출력용 JSON schema를 만들 수 있다 (사진 필드 없음)", () => {
    const { schema } = zodOutputFormat(DraftOutputBase);
    const text = JSON.stringify(schema);
    assert.ok(!text.includes('"photo"'), "LLM 출력 스키마에 photo가 있으면 안 됨");
    assert.ok(text.includes("photo_query"));
  });
});

describe("overlap", () => {
  it("번호·문장부호를 무시하고 비슷한 제목을 찾는다", () => {
    assert.ok(similarity("1. 퇴근 후 30분, 산책하기", "퇴근 후 30분 산책하기") > 0.9);
    assert.ok(similarity("관심 분야 하나, 연말까지 딱 3권", "퇴근 후 30분 산책하기") < 0.2);
    assert.equal(findOverlaps(["2. 주말 아침, 필사하기"], analysis.items_to_avoid).length, 1);
  });
});

describe("claude.ts", () => {
  it("분석: 검증 실패 시 오류를 붙여 1회 재시도", async () => {
    const { client, calls } = fakeClient(["{ 깨진 JSON", JSON.stringify(analysis)]);
    setClientForTesting(client);
    const result = await analyzeReference([{ name: "01.png", data: Buffer.from("png") }]);
    assert.deepEqual(result, analysis);
    assert.equal(calls.length, 2);
    // 재시도는 append-only: 원래 요청 + 모델 응답 + 오류 메시지
    assert.equal(calls[1].messages.length, 3);
    assert.match(calls[1].messages[2].content, /검증을 통과하지 못했어/);
    // 요청 파라미터
    assert.equal(calls[0].model, "claude-opus-5-5");
    assert.deepEqual(calls[0].thinking, { type: "adaptive" });
    assert.equal(calls[0].output_config.format.type, "json_schema");
    assert.equal(calls[0].fallbacks, "default");
    const imgs = calls[0].messages[0].content.filter((b: any) => b.type === "image");
    assert.equal(imgs.length, 1);
  });

  it("분석: 두 번 다 실패하면 에러", async () => {
    const { client } = fakeClient(["{}", "{}"]);
    setClientForTesting(client);
    await assert.rejects(analyzeReference([{ name: "a.jpg", data: Buffer.from("x") }]), /2회 시도 후에도/);
  });

  it("분석: 지원하지 않는 형식은 요청 전에 거른다", async () => {
    const { client, calls } = fakeClient([]);
    setClientForTesting(client);
    await assert.rejects(analyzeReference([{ name: "a.heic", data: Buffer.from("x") }]), /지원하지 않는/);
    assert.equal(calls.length, 0);
  });

  it("원고: 레퍼런스와 겹치면 1회 재생성", async () => {
    const first = sampleDraft();
    first.items[0].head = "1. 퇴근 후 30분 산책하기"; // items_to_avoid와 같음
    const second = sampleDraft();
    const { client, calls } = fakeClient([JSON.stringify(first), JSON.stringify(second)]);
    setClientForTesting(client);
    const r = await generateDraft({ analysis, topic: "연말 취향 정리", today: new Date(2026, 9, 11) });
    assert.equal(r.regenerated, true);
    assert.equal(r.overlaps.length, 0);
    assert.equal(calls.length, 2);
    assert.match(calls[1].messages[2].content, /겹치는 부분/);
    assert.match(calls[0].messages[0].content, /2026년 10월 11일/);
    assert.match(calls[0].messages[0].content, /연말 취향 정리/);
  });

  it("원고: self_check가 true여도 재생성", async () => {
    const first = sampleDraft();
    first.self_check = { overlap_with_reference: true, notes: "2번 항목이 비슷함" };
    const { client, calls } = fakeClient([JSON.stringify(first), JSON.stringify(sampleDraft())]);
    setClientForTesting(client);
    const r = await generateDraft({ analysis });
    assert.equal(r.regenerated, true);
    assert.equal(calls.length, 2);
  });

  it("원고: 겹침 없으면 한 번에 끝", async () => {
    const { client, calls } = fakeClient([JSON.stringify(sampleDraft())]);
    setClientForTesting(client);
    const r = await generateDraft({ analysis });
    assert.equal(r.regenerated, false);
    assert.equal(calls.length, 1);
  });

  it("CLAUDE_MODEL이 fallback 미지원 모델이면 fallbacks를 보내지 않는다", async () => {
    process.env.CLAUDE_MODEL = "claude-haiku-5-5";
    const { client, calls } = fakeClient([JSON.stringify(analysis)]);
    setClientForTesting(client);
    await analyzeReference([{ name: "01.png", data: Buffer.from("png") }]);
    assert.equal(calls[0].model, "claude-haiku-5-5");
    assert.equal(calls[0].fallbacks, undefined);
    assert.equal(calls[0].betas, undefined);
  });
});

describe("rewriteSlide", () => {
  const withPhotos = () => DraftSchema.parse(JSON.parse(readFileSync("samples/taste_check.json", "utf8")));

  it("항목: 번호는 그대로, 검색어가 바뀌면 사진을 비운다", async () => {
    const draft = withPhotos();
    const { client, calls } = fakeClient([
      JSON.stringify({
        head: "새로 쓴 제목",
        body: ["첫 줄이에요.", "둘째 줄이에요."],
        key: ["핵심 문장이에요."],
        pick: "PICK · 이번 주에 하나",
        photo_query: "new query",
      }),
    ]);
    setClientForTesting(client);
    const r = await rewriteSlide({ draft, analysis, target: "item.3", note: "더 짧게" });
    const item = r.draft.items[2];
    assert.equal(item.head, "3. 새로 쓴 제목");
    assert.equal(item.photo, undefined);
    assert.deepEqual(r.draft.items[0], draft.items[0], "다른 장은 그대로");
    assert.match(calls[0].messages[0].content, /3번 항목/);
    assert.match(calls[0].messages[0].content, /더 짧게/);
    assert.ok(!calls[0].messages[0].content.includes('"photo"'), "프롬프트에 사진 정보는 빼고 보냄");
  });

  it("표지: variant 고정, 검색어가 같으면 사진·콜라주 유지", async () => {
    const draft = withPhotos();
    const b = draft.covers[1];
    const { client } = fakeClient([
      JSON.stringify({ variant: "A", top_line: "새 한 줄", title: ["새 제목", "둘째 줄"], sub: "부제", photo_query: b.photo_query }),
    ]);
    setClientForTesting(client);
    const r = await rewriteSlide({ draft, target: "cover.B" });
    assert.equal(r.draft.covers[1].variant, "B");
    assert.equal(r.draft.covers[1].top_line, "새 한 줄");
    assert.deepEqual(r.draft.covers[1].photo, b.photo);
    assert.deepEqual(r.draft.covers[1].collage, b.collage);
  });

  it("항목 제목이 레퍼런스와 겹치면 한 번 더 요청", async () => {
    const item = (head: string) =>
      JSON.stringify({ head, body: ["a", "b"], key: ["c"], pick: "PICK · d", photo_query: "q" });
    const { client, calls } = fakeClient([item("1. 퇴근 후 30분 산책하기"), item("1. 전혀 다른 제목")]);
    setClientForTesting(client);
    const r = await rewriteSlide({ draft: withPhotos(), analysis, target: "item.1" });
    assert.equal(calls.length, 2);
    assert.equal(r.overlaps.length, 0);
    assert.equal(r.draft.items[0].head, "1. 전혀 다른 제목");
  });

  it("없는 장은 에러", async () => {
    await assert.rejects(rewriteSlide({ draft: withPhotos(), target: "item.9" }), /다시 쓸 수 없는 장/);
  });
});

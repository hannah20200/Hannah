import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach } from "node:test";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { analyzeReference, generateDraft, setClientForTesting } from "../src/lib/claude";
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

  it("기둥별 2개 규칙 위반을 잡는다", () => {
    const d = sampleDraft();
    d.items[0].pillar = "BUY";
    const r = DraftOutputSchema.safeParse(d);
    assert.equal(r.success, false);
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

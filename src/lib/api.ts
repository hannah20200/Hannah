/** API route 공통: 에러를 JSON 응답으로 */
import Anthropic from "@anthropic-ai/sdk";
import { ZodError } from "zod";
import { RefusalError } from "./claude";
import { StoreError } from "./store";

export function errorResponse(err: unknown, extra?: Record<string, unknown>): Response {
  let status = 500;
  let message = err instanceof Error ? err.message : String(err);
  if (err instanceof StoreError) status = err.status;
  else if (err instanceof ZodError) {
    status = 400;
    message = err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
  } else if (err instanceof RefusalError) status = 422;
  else if (err instanceof Anthropic.AuthenticationError) message = "Claude API 인증 실패: .env.local의 ANTHROPIC_API_KEY를 확인해 주세요.";
  else if (err instanceof Anthropic.NotFoundError) message = `모델을 찾을 수 없습니다: CLAUDE_MODEL 값을 확인해 주세요.`;
  else if (err instanceof Anthropic.RateLimitError) message = "Claude API 요청 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.";
  else if (err instanceof Anthropic.APIError) message = `Claude API 오류 ${err.status ?? ""}: ${err.message}`;
  if (status >= 500) console.error(err);
  return Response.json({ error: message, ...extra }, { status });
}

export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    return result instanceof Response ? result : Response.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}

export async function jsonBody<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new StoreError(400, "요청 본문이 JSON이 아닙니다");
  }
}

export const fileUrl = (id: string, area: "work" | "out", rel: string, version?: number | string) =>
  `/api/posts/${encodeURIComponent(id)}/file?area=${area}&path=${encodeURIComponent(rel)}${version ? `&v=${version}` : ""}`;

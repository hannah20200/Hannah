import Anthropic from "@anthropic-ai/sdk";
import { loadLocalEnv } from "../lib/env";

export function positional(): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      if (!BOOL_FLAGS.has(argv[i]) && i + 1 < argv.length) i++;
      continue;
    }
    out.push(argv[i]);
  }
  return out;
}

const BOOL_FLAGS = new Set(["--dry-run"]);

export function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

export function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export const log = (msg: string) => console.log(msg);

/** .env.local 로드 + 에러 메시지 정리 */
export function runCli(main: () => Promise<void>) {
  loadLocalEnv();
  main().catch((err) => {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Claude API 인증 실패: .env.local의 ANTHROPIC_API_KEY를 확인해 주세요.");
    } else if (err instanceof Anthropic.NotFoundError) {
      console.error(`모델을 찾을 수 없습니다: CLAUDE_MODEL 값을 확인해 주세요. (${err.message})`);
    } else if (err instanceof Anthropic.RateLimitError) {
      console.error("요청 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.");
    } else if (err instanceof Anthropic.APIError) {
      console.error(`Claude API 오류 ${err.status ?? ""}: ${err.message}`);
    } else {
      console.error(err instanceof Error ? err.message : err);
    }
    process.exit(1);
  });
}

/**
 * 웹 서버에서 렌더링: Next.js 번들은 react-dom/server를 쓸 수 없어서
 * 렌더 CLI(src/render/cli.ts)를 자식 프로세스로 실행한다. (Playwright도 서버 프로세스 밖에서 돈다)
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { OUT_DIR, ROOT } from "./paths";

export type RenderOutput = { dir: string; files: string[]; warnings: string[] };

export function renderInChild(draftPath: string, postId: string, timeoutMs = 180_000): Promise<RenderOutput> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", path.join(ROOT, "src/render/cli.ts"), draftPath, "--out", OUT_DIR, "--id", postId, "--json"],
      { cwd: ROOT, env: process.env },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const last = stdout.trim().split("\n").pop() ?? "";
      if (code === 0) {
        try {
          return resolve(JSON.parse(last) as RenderOutput);
        } catch {
          // 아래에서 에러로
        }
      }
      reject(new Error(`렌더링 실패 (code ${code}): ${(stderr || stdout).trim().slice(-1500)}`));
    });
  });
}

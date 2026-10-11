import { existsSync } from "node:fs";
import path from "node:path";

/** CLI용: 프로젝트 루트의 .env.local을 읽는다 (Next.js는 자체적으로 읽음) */
export function loadLocalEnv(root = process.cwd()) {
  const file = path.join(root, ".env.local");
  if (existsSync(file)) process.loadEnvFile(file);
}

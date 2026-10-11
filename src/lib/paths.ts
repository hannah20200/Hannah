import path from "node:path";

/**
 * 프로젝트 루트. npm 스크립트와 Next.js 서버는 모두 루트에서 실행된다.
 * (Next.js 번들 안에서는 import.meta.dirname이 소스 위치를 가리키지 않아서 cwd 기준으로 둔다)
 */
export const ROOT = process.env.PROJECT_ROOT ? path.resolve(process.env.PROJECT_ROOT) : process.cwd();
export const WORK_DIR = path.join(ROOT, "work");
export const OUT_DIR = path.join(ROOT, "out");
export const PROMPT_DIR = path.join(ROOT, "prompts");
export const FONT_DIR = path.join(ROOT, "public/fonts");
export const SAMPLE_DIR = path.join(ROOT, "samples");

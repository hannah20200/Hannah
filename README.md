# 작은 매거진 게시물 메이커

레퍼런스 게시물 캡처를 참고해 우리 계정 톤의 인스타그램 캐러셀(원고 + 1080×1350 PNG + 캡션)을 만드는 도구.
규칙은 `CLAUDE.md`, 상세 사양은 `SPEC.md`.

## 현재 단계: 2단계 (AI 연결)

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY, CLAUDE_MODEL 채우기

npm run render:sample        # 샘플 원고 → out/taste_check/*.png

# 레퍼런스 캡처 → 분석 → 원고 → PNG
npm run analyze -- ~/Desktop/ref_캡처 --id 연말취향      # → work/연말취향/analysis.json
npm run draft -- work/연말취향/analysis.json --topic "연말 취향 정리" --owned 써본것.txt
                                                          # → work/연말취향/draft.json
npm run render -- work/연말취향/draft.json                # → out/연말취향/*.png (사진은 3단계 전까지 대체 배경)
```

- 캡처 폴더: png/jpg/webp/gif 1~10장, 파일 이름 순서(1, 2, … 10)가 슬라이드 순서. 한 장당 5MB 이하.
- `--owned` 파일: 직접 써본 책·제품을 한 줄에 하나씩 (`#` 줄은 무시). 원고에는 이 목록에 있는 이름만 들어갑니다.
- `--dry-run`: API를 호출하지 않고 이미지 목록/프롬프트만 확인.
- 원고가 레퍼런스 항목과 겹치면(모델 self_check 또는 서버의 제목 유사도 점검) 자동으로 1회 재생성합니다.
- `work/`는 커밋하지 않습니다.

결과물 (`out/taste_check/`)
- `00_표지A.png`, `00_표지B.png`, `01_도입.png`, `02_항목1.png` … `07_항목6.png`, `08_마무리.png`
- `caption.txt` — 캡션 + 해시태그
- `_grid.png` — 검토용 전체 미리보기 (게시용 아님)
- `html/` — 장별 HTML (디자인 디버깅용, 브라우저로 열어볼 수 있음)

다른 원고 렌더링: `npm run render -- <원고.json> [--out out] [--id 이름]`

테스트: `npm test` (가짜 클라이언트로 재시도·재생성 로직 확인, API 호출 없음)

## 구조
- `prompts/system.md` — 계정 규칙(시스템 프롬프트), `analyze.md`, `draft.md` — 단계별 지시
- `src/lib/claude.ts` — Claude API 호출은 여기서만 (구조화 출력 + zod 검증 + 1회 재시도, 겹침 시 1회 재생성)
- `src/lib/overlap.ts` — 레퍼런스 항목과 제목 유사도 점검
- `src/cli/` — analyze / draft 명령
- `src/lib/schema.ts` — 원고 JSON zod 스키마 (SPEC 3-2, 사진 필드는 선택)
- `src/templates/tokens.ts` — 디자인 수치는 여기에만
- `src/templates/{Cover,Page,End}.tsx` — 슬라이드 템플릿
- `src/render/render.ts` — HTML → Playwright 스크린샷, 넘치는 한 줄 텍스트 자동 축소 + 경고
- `samples/photos/*.svg` — 로컬 placeholder 사진 (`npx tsx scripts/make-placeholders.ts`로 재생성)
- `public/fonts/` — Pretendard(500/600/700/800), Nanum Pen Script (둘 다 OFL)

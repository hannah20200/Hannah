# 작은 매거진 게시물 메이커

레퍼런스 게시물 캡처를 참고해 우리 계정 톤의 인스타그램 캐러셀(원고 + 1080×1350 PNG + 캡션)을 만드는 도구.
규칙은 `CLAUDE.md`, 상세 사양은 `SPEC.md`.

## 현재 단계: 1단계 CLI MVP

```bash
npm install
npm run render:sample        # samples/taste_check.json → out/taste_check/*.png
```

결과물 (`out/taste_check/`)
- `00_표지A.png`, `00_표지B.png`, `01_도입.png`, `02_항목1.png` … `07_항목6.png`, `08_마무리.png`
- `caption.txt` — 캡션 + 해시태그
- `_grid.png` — 검토용 전체 미리보기 (게시용 아님)
- `html/` — 장별 HTML (디자인 디버깅용, 브라우저로 열어볼 수 있음)

다른 원고 렌더링: `npx tsx src/render/cli.ts <원고.json> [--out out] [--id 이름]`

## 구조
- `src/lib/schema.ts` — 원고 JSON zod 스키마 (SPEC 3-2, 사진 필드는 선택)
- `src/templates/tokens.ts` — 디자인 수치는 여기에만
- `src/templates/{Cover,Page,End}.tsx` — 슬라이드 템플릿
- `src/render/render.ts` — HTML → Playwright 스크린샷, 넘치는 한 줄 텍스트 자동 축소 + 경고
- `samples/photos/*.svg` — 로컬 placeholder 사진 (`npx tsx scripts/make-placeholders.ts`로 재생성)
- `public/fonts/` — Pretendard(500/600/700/800), Nanum Pen Script (둘 다 OFL)

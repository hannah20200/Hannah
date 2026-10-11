# 작은 매거진 게시물 메이커

레퍼런스 게시물 캡처를 참고해 우리 계정 톤의 인스타그램 캐러셀(원고 + 1080×1350 PNG + 캡션)을 만드는 도구.
규칙은 `CLAUDE.md`, 상세 사양은 `SPEC.md`.

## 현재 단계: 3단계 (사진 API 연결)

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY, CLAUDE_MODEL, UNSPLASH_ACCESS_KEY, PEXELS_API_KEY

npm run render:sample        # 샘플 원고 → out/taste_check/*.png

# 레퍼런스 캡처 → 분석 → 원고 → PNG
npm run analyze -- ~/Desktop/ref_캡처 --id 연말취향      # → work/연말취향/analysis.json
npm run draft -- work/연말취향/analysis.json --topic "연말 취향 정리" --owned 써본것.txt
                                                          # → work/연말취향/draft.json
npm run photos -- work/연말취향/draft.json                # 사진 매칭 → draft.json에 사진·크레딧 기록
npm run render -- work/연말취향/draft.json                # → out/연말취향/*.png
```

- 캡처 폴더: png/jpg/webp/gif 1~10장, 파일 이름 순서(1, 2, … 10)가 슬라이드 순서. 한 장당 5MB 이하.
- `--owned` 파일: 직접 써본 책·제품을 한 줄에 하나씩 (`#` 줄은 무시). 원고에는 이 목록에 있는 이름만 들어갑니다.
- `--dry-run`: API를 호출하지 않고 이미지 목록/프롬프트만 확인.
- 원고가 레퍼런스 항목과 겹치면(모델 self_check 또는 서버의 제목 유사도 점검) 자동으로 1회 재생성합니다.
- `work/`는 커밋하지 않습니다.

### 사진 (`npm run photos`)
- 자리마다 `photo_query`로 Unsplash를 먼저 검색하고, 모자라면 Pexels로 채웁니다. 세로·가로 1000px 이상·밝은 사진이 앞에 옵니다.
- 제외: 광고/후원, Unsplash+ 유료, 가로 600px 미만, 설명·태그에 글자/AI 생성/일러스트/유명인·성인 매체 관련 단어가 있는 사진.
  설명에 드러나지 않는 경우(사진 속 글자, 유명인 얼굴)는 걸러내지 못하니 `work/{id}/photos.png` 후보 시트로 꼭 확인하세요.
- 한 게시물 안에서는 같은 사진을 두 번 쓰지 않고, 표지 A/B는 서로 다른 사진이 됩니다.
- 크레딧은 자동으로 `photo | 작가명 / Unsplash` 형식으로 들어갑니다.
- 바꾸기 (자리: `cover.A`, `cover.A.collage1`, `cover.A.collage2`, `cover.B`…, `intro.1`, `item.1`~`item.6`, `end`)
  ```bash
  npm run photos -- work/연말취향/draft.json --pick item.3=2            # 후보 시트의 2번으로
  npm run photos -- work/연말취향/draft.json --file "item.4=./내사진.jpg|본인 촬영"   # 직접 올리기 (크레딧 생략 시 "직접 촬영")
  npm run photos -- work/연말취향/draft.json --refresh                  # 다시 검색
  ```
- 검색 결과·선택은 `work/{id}/photos.json`에 저장돼서, 다시 실행해도 API를 다시 부르지 않습니다. `photo_query`를 고친 자리만 다시 검색합니다.
- Unsplash 데모 키는 시간당 50회 제한이 있습니다. 게시물 하나에 검색 약 10회 + 다운로드 집계 약 16회를 씁니다.
- 웹 API: `GET /api/photos?q=검색어` → 후보 6장 (`npm run dev`)

결과물 (`out/taste_check/`)
- `00_표지A.png`, `00_표지B.png`, `01_도입.png`, `02_항목1.png` … `07_항목6.png`, `08_마무리.png`
- `caption.txt` — 캡션 + 해시태그
- `_grid.png` — 검토용 전체 미리보기 (게시용 아님)
- `html/` — 장별 HTML (디자인 디버깅용, 브라우저로 열어볼 수 있음)

다른 원고 렌더링: `npm run render -- <원고.json> [--out out] [--id 이름]`

테스트: `npm test` (가짜 Claude 클라이언트·가짜 사진 API로 확인, 실제 API 호출 없음)

## 구조
- `prompts/system.md` — 계정 규칙(시스템 프롬프트), `analyze.md`, `draft.md` — 단계별 지시
- `src/lib/claude.ts` — Claude API 호출은 여기서만 (구조화 출력 + zod 검증 + 1회 재시도, 겹침 시 1회 재생성)
- `src/lib/overlap.ts` — 레퍼런스 항목과 제목 유사도 점검
- `src/lib/photos.ts` — Unsplash/Pexels 검색·제외·정렬·내려받기, `photo-plan.ts`·`photo-match.ts` — 자리별 배정
- `src/render/sheet.ts` — 사진 후보 시트
- `src/cli/` — analyze / draft / photos 명령
- `src/lib/schema.ts` — 원고 JSON zod 스키마 (SPEC 3-2, 사진 필드는 선택)
- `src/templates/tokens.ts` — 디자인 수치는 여기에만
- `src/templates/{Cover,Page,End}.tsx` — 슬라이드 템플릿
- `src/render/render.ts` — HTML → Playwright 스크린샷, 넘치는 한 줄 텍스트 자동 축소 + 경고
- `samples/photos/*.svg` — 로컬 placeholder 사진 (`npx tsx scripts/make-placeholders.ts`로 재생성)
- `public/fonts/` — Pretendard(500/600/700/800), Nanum Pen Script (둘 다 OFL)

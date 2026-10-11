# 작은 매거진 게시물 메이커

레퍼런스 게시물 캡처를 참고해 우리 계정 톤의 인스타그램 캐러셀(원고 + 1080×1350 PNG + 캡션)을 만드는 도구.
규칙은 `CLAUDE.md`, 상세 사양은 `SPEC.md`.

## 웹 화면

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY, CLAUDE_MODEL, UNSPLASH_ACCESS_KEY, PEXELS_API_KEY
npm run dev                  # http://localhost:3000
```

1. **업로드** — 레퍼런스 캡처 1~10장(순서 조정 가능) + 주제 메모 + 직접 써본 것 목록
2. **분석** — 구성 / 톤 / 비주얼 / 잘한 점 / 차별점 / 겹치면 안 되는 항목·결론 카드
3. **원고** — 표지 A/B, 도입, 항목 6개, 마무리, 캡션·해시태그를 직접 고치기. 장마다 실시간 미리보기와 "다시 쓰기"(요청 메모 가능)
4. **사진** — 자리마다 후보 중 고르기 또는 직접 올리기. 크레딧 자동 표기
5. **미리보기·게시** — PNG 10장 그리드 + 크게 보기(←/→), zip 다운로드, 캡션·해시태그 복사, Instagram 예약·게시

**콘텐츠 보드** (`/board`) — 아이디어 메모 → 작업 중 → 게시 준비 → 예약 → 게시됨, 앞으로 2주 달력, Instagram 연결 상태.

API 키가 없어도 **"샘플 원고로 둘러보기"**로 원고 수정 → 미리보기 → zip까지 해볼 수 있습니다.
게시물은 CLI와 같은 `work/{id}/`에 저장돼서, 웹에서 만든 게시물을 CLI로 이어서 작업할 수도 있습니다.

## Instagram 게시 설정 (5단계, 선택)

Instagram API로 캐러셀을 올리려면 아래가 필요합니다.

1. **Instagram 비즈니스 또는 크리에이터 계정**
2. **Meta 개발자 앱** + `instagram_business_content_publish` 권한의 **장기 액세스 토큰**과 **Instagram 계정 ID**
   (Facebook 로그인 방식 토큰이면 `INSTAGRAM_GRAPH_HOST=graph.facebook.com`)
3. **공개 주소**: Instagram 서버가 이 앱에서 이미지를 직접 가져가기 때문에, 로컬 앱이 바깥에서 보여야 합니다.
   ```bash
   npm run build && npm run start                       # http://localhost:3000
   cloudflared tunnel --url http://localhost:3000       # 나오는 https://xxxx.trycloudflare.com 을 PUBLIC_BASE_URL에
   ```
   이미지 주소(`/api/public/{id}/{비밀 토큰}/NN.jpg`)는 해당 게시물이 **게시 중일 때만** 열립니다.
4. `.env.local`에 `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, `PUBLIC_BASE_URL` → 서버 재시작 → 보드의 "Instagram 연결"이 모두 초록색인지 확인

게시 방식
- 첫 장은 표지 A/B 중 하나만 → **표지 1장 + 도입 + 항목 6장 + 마무리 = 9장** 캐러셀
- 미리보기에서 만든 PNG를 그대로 **JPEG로 변환**해서 올립니다 (Instagram API는 JPEG만 받음). 원고를 고쳤다면 PNG를 다시 만들어 주세요.
- 캡션 2,200자·해시태그 30개를 넘으면 예약 전에 막습니다.
- **예약**: Instagram API에는 예약 기능이 없어서, 이 앱의 스케줄러가 1분마다 확인해 시간이 되면 올립니다.
  그래서 예약 시각에 **앱 서버와 터널이 켜져 있어야** 합니다. (서버 대신 cron으로 `npm run publish:due`를 돌려도 됩니다 — 이때도 이미지 제공용 서버·터널은 필요)
- 실패하면 보드·미리보기에 이유가 나오고, "지금 다시 게시"나 예약 바꾸기로 다시 시도할 수 있습니다.
- 24시간 게시 한도는 연결 상태에서 확인할 수 있습니다. 장기 토큰은 약 60일마다 갱신해야 합니다.

CLI: `npm run publish -- <id> --cover A --at "2026-10-15 20:00"` (예약) · `--now` (지금) · `--cancel` · `npm run publish:due`

## CLI

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
- `src/app/` — 웹 화면 (`/`, `/posts/{id}/analyze|draft|photos|preview`), `src/app/api/` — analyze, draft(+rewrite), photos(+match, upload), render, export, posts
- `src/lib/store.ts` — 게시물 저장소 (`work/{id}/`), `render-process.ts` — 웹에서 렌더 CLI를 자식 프로세스로 실행
- `src/lib/instagram.ts` — Graph API 캐러셀 게시, `publish.ts` — 예약·게시·runDue, `scheduler.ts` + `src/instrumentation.ts` — 서버 내 스케줄러, `jpeg.ts` — PNG→JPEG
- `src/app/board/` — 콘텐츠 보드
- `src/lib/schema.ts` — 원고 JSON zod 스키마 (SPEC 3-2, 사진 필드는 선택)
- `src/templates/tokens.ts` — 디자인 수치는 여기에만
- `src/templates/{Cover,Page,End}.tsx` — 슬라이드 템플릿
- `src/render/render.ts` — HTML → Playwright 스크린샷, 넘치는 한 줄 텍스트 자동 축소 + 경고
- `samples/photos/*.svg` — 로컬 placeholder 사진 (`npx tsx scripts/make-placeholders.ts`로 재생성)
- `public/fonts/` — Pretendard(500/600/700/800), Nanum Pen Script (둘 다 OFL)

# SPEC.md — 작은 매거진 게시물 메이커

## 1. 한 줄 요약
레퍼런스 게시물 캡처(1~10장) + 주제(선택)를 넣으면 → 분석 → 원고(JSON) → 사진 매칭 → 1080×1350 PNG 렌더링 → 검토·수정 → zip + 캡션 다운로드.

## 2. 사용자 흐름
1. **업로드**: 레퍼런스 캡처 이미지 여러 장, (선택) 주제 메모, (선택) 직접 써본 책·제품 목록.
2. **분석 결과 확인**: 레퍼런스의 구성/톤/잘한 점/차별점 카드.
3. **원고 확인·수정**: 표지 A/B, 도입, 본문 항목(3~8개), 마무리를 화면에서 직접 고칠 수 있음. 장별 "다시 쓰기" 버튼.
4. **사진 선택**: 장마다 후보 6장(검색어 자동 생성) 중 선택, 또는 직접 업로드.
5. **미리보기**: 전체 그리드 + 장별 확대.
6. **내보내기**: PNG zip, 캡션·해시태그 복사 버튼.

## 3. 파이프라인

### 3-1. 레퍼런스 분석 (`POST /api/analyze`)
입력: 이미지 배열. Claude API(이미지 입력)로 아래 JSON 생성.
```json
{
  "slides": [{"index": 1, "role": "cover|intro|item|end", "text": "슬라이드 속 텍스트 요약", "visual": "사진/레이아웃 설명"}],
  "theme": "레퍼런스의 핵심 메시지 한 줄",
  "tone": "말투 설명",
  "visual_style": "사진 톤·레이아웃 특징",
  "strengths": ["잘한 점"],
  "items_to_avoid": ["레퍼런스 항목 제목들 — 새 원고에서 겹치면 안 됨"]
}
```

### 3-2. 원고 생성 (`POST /api/draft`)
입력: 분석 JSON + 주제 + 사용자 보유 아이템 + CLAUDE.md의 계정 규칙(시스템 프롬프트).
출력 스키마(zod로 검증):
```json
{
  "category": "READ|BUY|WEAR (선택, 게시물 단위)",
  "covers": [
    {"variant": "A", "top_line": "(선택) 상단 한 줄", "title": ["1줄", "2줄"], "sub": "부제", "photo_query": "검색어(영문)"},
    {"variant": "B", "top_line": "...", "title": ["...", "..."], "sub": "...", "photo_query": "..."}
  ],
  "intro": [
    {"body": ["2~3줄"], "key": ["굵은 밑줄 1~2줄"], "photo_query": "..."}
  ],
  "items": [
    {"head": "1. 항목 제목", "body": ["2줄"], "key": ["굵은 밑줄 1줄"], "pick": "PICK · 구체적 선택지", "photo_query": "..."}
  ],
  "end": {"lines": ["질문형 1~2줄"], "cta": "저장 유도 1줄"} ,
  "caption": "인스타 캡션 전문",
  "hashtags": ["#..."],
  "self_check": {"overlap_with_reference": false, "notes": "겹침 점검 결과"}
}
```
규칙:
- items는 3~8개(레퍼런스 구성에 맞춤), intro는 0~1개. 표지 1 + 도입 + 항목 + 마무리 1 ≤ 10장(캐러셀 한도).
- category는 계정 전체의 분류(READ/BUY/WEAR)로, 게시물 단위로 하나만 붙이거나 비운다. 항목마다 나누지 않는다.
- `self_check.overlap_with_reference`가 true면 서버에서 재생성 1회.
- 사용자 경험이 필요한 1인칭 문장은 넣지 않거나 `[확인 필요]` 표시.

### 3-3. 사진 매칭 (`GET /api/photos?q=`)
- Unsplash 우선, 부족하면 Pexels. 세로(portrait) 우선, 가로 1000px 이상.
- 후보 6장 반환 + 작가명/링크 저장(크레딧 표기용: `photo | 작가명 / Unsplash`).

### 3-4. 렌더링 (`POST /api/render`)
- 각 슬라이드를 HTML(React 컴포넌트 → 정적 HTML)로 만들고 Playwright로 1080×1350 PNG 캡처.
- 결과: `/out/{postId}/{00_표지A, 00_표지B, 02..}.png`

## 4. 템플릿 사양 (tokens.ts)
공통
- 캔버스 1080×1350, 폰트 Pretendard(500/600/700/800), 손글씨 Nanum Pen Script
- 색: INK `#1E1B18`, BUTTER `#F5DB8B`, 텍스트 화이트, 그림자 `rgba(0,0,0,.45)` blur 14
- 필름 처리: 따뜻한 soft-light `rgba(120,80,40,.10)` + 노이즈(alpha 약 0.035)
- 크레딧: 좌하단 (48, 1310), 18px, 흰색 75%

표지 (Cover)
- 사진 풀블리드(cover-fit, 세로 기준점 0.3)
- 상단 그라데이션 0→240px (검정 40%→0), 하단 그라데이션 640px→끝 (0→82%)
- 상단 한 줄: 중앙, y=120, 32px 600
- 제목: 좌측 x=72, 첫 줄 y=1010, 70px 800, 줄간 88
- 부제: 제목 아래, 29px 500, 흰색 90%
- 콜라주: 작은 사진 2장(약 220×280), ±4~5° 회전, 그림자 blur 24, 얼굴을 가리지 않는 위치(기본: 우상단 880,340 / 좌측 170,420)

본문 (Page)
- 배경: 같은 사진 blur 28px + 어둡게 `rgba(20,14,8,.45)` — **흰 단색 금지**
- 라벨(게시물 category, 없으면 생략): 중앙 y=130, 22px 700, BUTTER, 자간 4
- 제목: 중앙 y=192, 42px 700
- 사진 카드: 폭 820, 높이 660(제목 있음) / 760(도입), 중앙 정렬, 그림자 blur 30
- 본문: 카드 아래 +76부터, 29px 500, 줄간 46, 흰색 92%
- 굵은 문장: 32px 800, BUTTER, 밑줄 2.5px
- PICK: BUTTER 테두리 알약(높이 56, radius 28), 26px 600

마무리 (End)
- 배경: 사진 blur + 어둡게 50%, 중앙 질문 2줄(64px 800) + 댓글/저장 유도(34px)

## 5. 기술 스택 / 폴더
- Next.js(App Router) + TypeScript, Tailwind(검토 화면용), zod, Playwright, JSZip
- Anthropic SDK(`@anthropic-ai/sdk`), 모델은 `CLAUDE_MODEL` 환경변수
```
src/
  app/                # 화면: upload / analyze / draft / photos / preview
  app/api/            # analyze, draft, photos, render, export
  lib/claude.ts       # API 호출 + 프롬프트 + zod 검증
  lib/photos.ts       # Unsplash/Pexels
  templates/          # Cover.tsx, Page.tsx, End.tsx, tokens.ts
  render/render.ts    # Playwright 렌더러
prompts/              # system.md(계정 규칙), analyze.md, draft.md
public/fonts/
samples/              # 샘플 원고 JSON (render:sample용)
```
환경변수: `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `UNSPLASH_ACCESS_KEY`, `PEXELS_API_KEY`

## 6. 개발 단계
1. **CLI MVP**: `samples/taste_check.json` → `npm run render:sample` → PNG 10장. (템플릿 완성도 먼저)
2. **AI 연결**: `analyze`·`draft` CLI 명령. 캡처 폴더 → 원고 JSON.
3. **사진 API 연결** + 크레딧 자동 표기.
4. **웹 화면**: 업로드 → 원고 수정 → 사진 선택 → 미리보기 → zip.
5. (선택) 콘텐츠 보드, Instagram Graph API 예약 게시(비즈니스 계정 필요).

## 7. 샘플 원고 (render:sample용 초기 데이터)
표지 A: top "연말 쇼핑 전에, 이것부터" / title ["취향 좋은 여자들이", "10월에 몰래 하는 것"]
표지 B: top "읽은 책, 입은 옷, 산 것까지" / title ["올해 잘 산 거 3개,", "바로 말할 수 있어?"]
부제: "연말 전, 내 취향을 정리하는 6가지"
items:
1. 관심 분야 하나, 연말까지 딱 3권 — PICK · 입문서 → 에세이 → 인터뷰집 순서로
2. 저장만 해둔 것, 다시 열어보기 — PICK · 3개만 남기고, 이번 주에 하나 해보기
3. 매일 쓰는 것부터 좋은 걸로 — PICK · 이번 달 업그레이드할 물건 딱 하나
4. 연말 세일 전, 장바구니 30일 묵혀보기 — PICK · 세일 알림 대신 위시리스트 메모
5. 올해 가장 많이 입은 옷 3벌 찾기 — PICK · 그 3벌의 공통점을 한 줄로 적기
6. 새 옷 여러 벌 대신, 시그니처 하나 — PICK · 안경, 귀걸이, 코트 중 딱 하나

## 8. Claude Code 첫 요청 (복사해서 사용)
> CLAUDE.md와 SPEC.md를 읽고, 6장 개발 단계의 1단계(CLI MVP)부터 만들어줘. Next.js + TypeScript 프로젝트를 세팅하고, src/templates에 Cover/Page/End 템플릿을 SPEC 4장 수치대로 만든 뒤, samples/taste_check.json(SPEC 7장 내용, 사진은 우선 로컬 placeholder)을 Playwright로 1080×1350 PNG 10장으로 렌더링하는 `npm run render:sample`을 만들어줘. 끝나면 결과 PNG 경로를 알려줘.

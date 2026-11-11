# 도현의 개발 노트 (Astro 블로그)

아키텍처 · LLM 엔지니어링 고민을 적는 개인 블로그. 마크다운으로 글만 쓰면 되는 상태로 세팅돼 있습니다.

## 로컬에서 실행

Node.js 22.12 이상이 필요합니다.

```bash
npm install      # 의존성 설치 (최초 1회)
npm run dev      # 개발 서버 → http://localhost:4321
```

## 글 쓰는 법

`src/content/blog/` 안에 `.md` 파일을 만들고, 맨 위에 아래 형식(frontmatter)만 채우면 됩니다.

```markdown
---
title: '글 제목'
description: '한 줄 요약'
pubDate: 'Jun 28 2026'
category: 'LLM 엔지니어링'
---

본문은 여기서부터...
```

- `category` 는 자유롭게 적으면 됩니다. **새 카테고리를 쓰면 카테고리 페이지가 자동으로 생성**됩니다. (별도 설정 불필요)
- `heroImage`(대표 이미지)는 선택이라 없어도 됩니다.
- 첫 글은 `src/content/blog/first-post-template.md` 에 골격을 넣어뒀습니다. **"사건 → 원칙"** 구조로, 일반론에 빠지지 않게 쓰는 템플릿이니 복사해서 채우세요.

### 하루 1편 글 틀 만들기

```bash
npm run new-post -- --title "제목" --category 회고 [--date 2026-11-11] [--slug my-slug]
```

- `src/content/blog/YYYY/MM/YYYY-MM-DD-<slug>.md` 가 `draft: true` 로 만들어집니다. (날짜를 빼면 오늘)
- slug 를 안 주면 제목의 영문·숫자로 만들고, 한글만 있으면 `YYYY-MM-DD.md` 처럼 날짜만 씁니다.
- 같은 파일이 이미 있으면 덮어쓰지 않고 멈춥니다.

**draft 공개하기**: draft 글은 `npm run dev` 에서만 보이고 빌드(배포)·RSS·사이트맵에는 빠집니다. 다 쓰면 `description` 을 채우고 머리말의 `draft: true` 를 지우거나 `draft: false` 로 바꾼 뒤 main 에 올리면 공개됩니다.

## 개인화 포인트

- `src/consts.ts` — 사이트 제목 · 설명
- `src/components/Header.astro`, `Footer.astro` — GitHub 링크(`your-username`를 본인 계정으로)
- `src/pages/about.astro` — 소개 페이지
- `astro.config.mjs` 의 `site` — 배포할 도메인 (RSS · sitemap에 사용)

## 배포

빌드 후 정적 파일이 `dist/` 에 생성됩니다.

```bash
npm run build    # 정적 사이트 빌드
npm run preview  # 빌드 결과 미리보기
```

가장 쉬운 길은 GitHub 저장소에 올린 뒤 **Vercel** 에 연결하는 것입니다 (푸시할 때마다 자동 배포). **GitHub Pages** 로도 배포할 수 있습니다 — 그 경우 Astro 공식 문서의 GitHub Pages 가이드를 참고하세요. 배포는 본인 계정 연동이 필요하니 직접 진행하시면 됩니다.

## CI

main 으로 가는 PR 마다 `.github/workflows/ci.yml` 이 `npm ci → npx astro check → npm run build → npm test` 를 돌립니다. (test 스크립트가 없으면 건너뜀)

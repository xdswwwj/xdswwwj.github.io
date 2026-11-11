import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT_DIR = join(ROOT, 'src', 'content', 'blog');
const DIST_DIR = join(ROOT, 'dist');
const FIXTURE_DIR = join(CONTENT_DIR, '__qa_temp_fixtures__');

// 비정상 종료 시에도 임시 fixture 가 남지 않도록 보장
process.on('exit', () => {
	try {
		rmSync(FIXTURE_DIR, { recursive: true, force: true });
	} catch {}
});

function runBuild() {
	execFileSync('npm', ['run', 'build'], {
		cwd: ROOT,
		stdio: 'pipe',
		encoding: 'utf8',
	});
}

function collectFiles(dir, predicate = () => true, acc = []) {
	if (!existsSync(dir)) return acc;
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			collectFiles(full, predicate, acc);
		} else if (predicate(full)) {
			acc.push(full);
		}
	}
	return acc.sort();
}

function stripScriptAndStyle(html) {
	return html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

function extractMetaContent(html, attrName, attrValue) {
	const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
	const attrRe = new RegExp(`\\b${attrName}=(["'])${attrValue}\\1`, 'i');
	for (const tag of metaTags) {
		if (!attrRe.test(tag)) continue;
		const quoted = tag.match(/\bcontent=(["'])([\s\S]*?)\1/i);
		if (quoted) return quoted[2];
		// HTML5 빈 속성 직렬화 (<meta name="description" content>) 처리
		if (/\bcontent(?=[\s/>])/i.test(tag)) return '';
	}
	return null;
}

function resolveDistTarget(distDir, pathname) {
	const decoded = decodeURIComponent(pathname);
	const clean = decoded.replace(/^\/+/, '');
	if (decoded.endsWith('/')) {
		const indexFile = join(distDir, clean, 'index.html');
		return existsSync(indexFile) && statSync(indexFile).isFile() ? indexFile : null;
	}
	const candidates = [
		join(distDir, clean),
		join(distDir, clean, 'index.html'),
		join(distDir, `${clean}.html`),
	];
	for (const candidate of candidates) {
		if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
	}
	return null;
}

function collectDraftPostIds(contentDir) {
	const mdFiles = collectFiles(contentDir, (f) => /\.(md|mdx)$/.test(f));
	const drafts = [];
	for (const file of mdFiles) {
		const raw = readFileSync(file, 'utf8');
		const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
		if (!fm) continue;
		if (/^\s*draft\s*:\s*true\s*$/m.test(fm[1])) {
			const rel = relative(contentDir, file)
				.replace(/\\/g, '/')
				.replace(/\.(md|mdx)$/, '');
			drafts.push(rel);
		}
	}
	return drafts;
}

function inspectDist(distDir, { forbiddenStrings = [] } = {}) {
	const htmlFiles = collectFiles(distDir, (f) => f.endsWith('.html'));
	assert.ok(htmlFiles.length > 0, 'dist 안에 HTML 파일이 있어야 합니다.');

	const draftIds = collectDraftPostIds(CONTENT_DIR);
	const linkCounts = { blog: 0, tags: 0, categories: 0 };

	for (const htmlFile of htmlFiles) {
		const relHtml = relative(distDir, htmlFile).replace(/\\/g, '/');
		const html = readFileSync(htmlFile, 'utf8');
		const bodyMarkup = stripScriptAndStyle(html);

		// 1. 모든 HTML 에 비어 있지 않은 h1 이 정확히 하나씩 있는지
		const h1Matches = [...bodyMarkup.matchAll(/<h1(?:\s[^>]*)?>([\s\S]*?)<\/h1>/gi)];
		assert.equal(
			h1Matches.length,
			1,
			`${relHtml}: <h1> 개수가 1이어야 하지만 ${h1Matches.length}개입니다.`,
		);
		const h1Text = h1Matches[0][1].replace(/<[^>]+>/g, '').trim();
		assert.ok(h1Text.length > 0, `${relHtml}: <h1> 텍스트가 비어 있습니다.`);

		// 2. title · description · og:image 메타가 있는지
		const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
		assert.ok(titleMatch && titleMatch[1].trim().length > 0, `${relHtml}: <title> 이 없습니다.`);

		const description = extractMetaContent(html, 'name', 'description');
		assert.notEqual(
			description,
			null,
			`${relHtml}: <meta name="description"> 가 없습니다.`,
		);

		const ogImage = extractMetaContent(html, 'property', 'og:image');
		assert.ok(ogImage && ogImage.length > 0, `${relHtml}: <meta property="og:image"> 가 없습니다.`);
		const ogUrl = new URL(ogImage);
		const ogFile = resolveDistTarget(distDir, ogUrl.pathname);
		assert.ok(
			ogFile && statSync(ogFile).size > 0,
			`${relHtml}: og:image(${ogUrl.pathname}) 파일이 dist 에 없습니다.`,
		);

		// 3. 내부 링크(/blog/…, /tags/…, /categories/… 등)가 실제 파일로 이어지는지
		for (const match of bodyMarkup.matchAll(/<a\b[^>]*\bhref=(["'])(.*?)\1/gi)) {
			const href = match[2];
			if (href.startsWith('#')) {
				const anchorId = decodeURIComponent(href.slice(1));
				if (anchorId) {
					assert.ok(
						bodyMarkup.includes(`id="${anchorId}"`) || bodyMarkup.includes(`id='${anchorId}'`),
						`${relHtml}: 문서 안 앵커(${href}) 대상을 찾을 수 없습니다.`,
					);
				}
				continue;
			}
			if (!href.startsWith('/') || href.startsWith('//')) continue;

			const pathname = href.split('#')[0].split('?')[0];
			if (pathname.startsWith('/blog/')) linkCounts.blog++;
			if (pathname.startsWith('/tags/')) linkCounts.tags++;
			if (pathname.startsWith('/categories/')) linkCounts.categories++;

			const target = resolveDistTarget(distDir, pathname);
			assert.ok(
				target,
				`${relHtml}: 내부 링크 "${href}" 가 가리키는 파일이 dist 에 없습니다.`,
			);
		}

		// 4. draft 글이나 금지된 표식이 HTML 에 노출되지 않는지
		for (const draftId of draftIds) {
			assert.ok(
				!html.includes(`/blog/${draftId}`),
				`${relHtml}: draft 글(${draftId}) 링크가 노출되었습니다.`,
			);
		}
		for (const token of forbiddenStrings) {
			assert.ok(
				!html.includes(token),
				`${relHtml}: 노출되면 안 되는 draft 표식(${token})이 포함되었습니다.`,
			);
		}
	}

	assert.ok(linkCounts.blog > 0, '/blog/… 내부 링크가 최소 1개 이상 검증되어야 합니다.');
	assert.ok(linkCounts.tags > 0, '/tags/… 내부 링크가 최소 1개 이상 검증되어야 합니다.');
	assert.ok(
		linkCounts.categories > 0,
		'/categories/… 내부 링크가 최소 1개 이상 검증되어야 합니다.',
	);

	// RSS · 사이트맵 · OG 이미지에서도 draft 제외 확인
	for (const draftId of draftIds) {
		assert.equal(existsSync(join(distDir, 'blog', draftId, 'index.html')), false);
		assert.equal(existsSync(join(distDir, 'og', `${draftId}.png`)), false);
	}
	for (const xmlName of ['rss.xml', 'sitemap-0.xml']) {
		const xmlPath = join(distDir, xmlName);
		if (!existsSync(xmlPath)) continue;
		const xml = readFileSync(xmlPath, 'utf8');
		for (const draftId of draftIds) {
			assert.ok(!xml.includes(draftId), `${xmlName}: draft 글(${draftId})이 포함되었습니다.`);
		}
		for (const token of forbiddenStrings) {
			assert.ok(!xml.includes(token), `${xmlName}: draft 표식(${token})이 포함되었습니다.`);
		}
	}
}

describe('빌드 결과물 및 경계 경우 검증', () => {
	test('경계 fixture(100자+ 제목·긴 영문 단어·빈 요약·태그 0개/10개·draft) 빌드 검증 후 흔적 없이 정리한다', () => {
		const over100Title =
			'백자가넘는긴제목경계시험입니다레이아웃과메타태그그리고오지이미지생성과목록화면이전다음글카드에서모두깨지지않고정상렌더링되는지꼼꼼하게확인하기위해일부러백이십자이상으로길게작성한시험용제목입니다끝까지확인';
		assert.ok(over100Title.length > 100);

		const unbrokenEnglishWord = 'Pneumonoultramicroscopicsilicovolcanoconiosis'.repeat(4); // 180자 공백 없는 영문 단어
		const tenTags = Array.from({ length: 10 }, (_, idx) => `경계태그-${idx + 1}`);
		const draftSentinel = 'QA_DRAFT_ONLY_SENTINEL_987654';

		try {
			mkdirSync(join(FIXTURE_DIR, '2026', '11'), { recursive: true });

			// (a) 100자 넘는 제목 + description 빈 값 + 태그 0개 (빈 배열)
			writeFileSync(
				join(FIXTURE_DIR, '2026', '11', '2026-11-09-long-title-empty-desc.md'),
				`---
title: '${over100Title}'
description: ''
pubDate: '2026-11-09'
category: '경계시험'
tags: []
---

## 백 자 넘는 제목과 빈 요약 확인

본문 내용이 정상으로 들어갑니다.
`,
				'utf8',
			);

			// (b) 공백 없는 긴 영문 단어 + 태그 10개
			writeFileSync(
				join(FIXTURE_DIR, '2026', '11', '2026-11-10-unbroken-word-ten-tags.md'),
				`---
title: '긴 단어 시험 ${unbrokenEnglishWord}'
description: '${unbrokenEnglishWord}'
pubDate: '2026-11-10'
category: '경계시험'
tags: [${tenTags.map((t) => `'${t}'`).join(', ')}]
---

## 공백 없는 긴 영문 단어와 태그 10개 확인

본문 긴 단어: ${unbrokenEnglishWord}

인라인 코드: \`${unbrokenEnglishWord}\`
`,
				'utf8',
			);

			// (c) tags 필드 자체를 생략한 태그 0개 글
			writeFileSync(
				join(FIXTURE_DIR, '2026', '11', '2026-11-11-omitted-tags.md'),
				`---
title: '태그 생략 글'
description: '태그 필드를 적지 않은 글'
pubDate: '2026-11-11'
category: '경계시험'
---

## 태그 생략 확인

태그가 없어도 빌드가 잘 되어야 합니다.
`,
				'utf8',
			);

			// (d) draft: true 글 (빌드 결과 어디에도 나오면 안 됨)
			writeFileSync(
				join(FIXTURE_DIR, '2026', '11', '2026-11-12-draft-post.md'),
				`---
title: '${draftSentinel}'
description: '${draftSentinel}'
pubDate: '2026-11-12'
category: '${draftSentinel}'
tags: ['${draftSentinel}']
draft: true
---

${draftSentinel}
`,
				'utf8',
			);

			runBuild();

			// 전체 HTML · 메타 · 내부 링크 · draft 제외 검사
			inspectDist(DIST_DIR, { forbiddenStrings: [draftSentinel] });

			// 경계 경우별 세부 출력 확인
			const longTitleHtml = readFileSync(
				join(
					DIST_DIR,
					'blog',
					'__qa_temp_fixtures__',
					'2026',
					'11',
					'2026-11-09-long-title-empty-desc',
					'index.html',
				),
				'utf8',
			);
			assert.ok(longTitleHtml.includes(over100Title), '100자 넘는 제목이 HTML 에 그대로 들어가야 합니다.');
			assert.equal(
				extractMetaContent(longTitleHtml, 'name', 'description'),
				'',
				'빈 description 은 content="" 메타로 출력되어야 합니다.',
			);
			assert.ok(
				!longTitleHtml.includes('class="p-desc"'),
				'빈 description 일 때 빈 p-desc 문단이 렌더되지 않아야 합니다.',
			);
			assert.ok(
				!longTitleHtml.includes('class="chips p-tags"'),
				'태그 0개 글에는 태그 목록이 렌더되지 않아야 합니다.',
			);

			const tenTagsHtml = readFileSync(
				join(
					DIST_DIR,
					'blog',
					'__qa_temp_fixtures__',
					'2026',
					'11',
					'2026-11-10-unbroken-word-ten-tags',
					'index.html',
				),
				'utf8',
			);
			assert.ok(tenTagsHtml.includes(unbrokenEnglishWord), '공백 없는 긴 영문 단어가 포함되어야 합니다.');
			for (const tag of tenTags) {
				assert.ok(tenTagsHtml.includes(`#${tag}`), `태그 칩 #${tag} 가 렌더되어야 합니다.`);
				assert.equal(
					existsSync(join(DIST_DIR, 'tags', tag, 'index.html')),
					true,
					`태그 페이지 /tags/${tag}/ 가 생성되어야 합니다.`,
				);
			}
		} finally {
			rmSync(FIXTURE_DIR, { recursive: true, force: true });
			runBuild();
		}

		// 정리 확인: 실제 content 폴더에 임시 fixture 가 남지 않고 깨끗한 dist 도 모든 검사를 통과해야 함
		assert.equal(existsSync(FIXTURE_DIR), false, '임시 fixture 폴더가 지워져야 합니다.');
		assert.equal(
			existsSync(join(DIST_DIR, 'blog', '__qa_temp_fixtures__')),
			false,
			'재빌드 뒤 dist 에 임시 fixture 흔적이 없어야 합니다.',
		);
		inspectDist(DIST_DIR);
	});
});

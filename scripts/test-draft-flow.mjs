#!/usr/bin/env node
// 초안 생성 → 빌드 제외 → 발행 → 빌드 노출 및 예외 입력 통합 시험
// - 빌드 결과물은 임시 폴더(--outDir)에 만든다. 저장소의 dist/ 는 건드리지 않는다.
// - 시험 글 두 개(2026-11-11-qa-draft-*.md)는 src/content/blog 에 잠깐 쓴다(빌드에 넣어야 하므로).
//   끝나거나 Ctrl+C(SIGINT)·SIGTERM 으로 멈춰도 지운다. .gitignore 에도 넣어 커밋에 섞이지 않게 했다.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blogDir = path.join(repoRoot, 'src', 'content', 'blog');
const realDistDir = path.join(repoRoot, 'dist');
let distDir = null; // 각 빌드의 임시 결과물 폴더 (tmpDir 아래)

const TEST_DATE = '2026-11-11';
const TEST_SLUG = 'qa-draft-test';
const TEST_ID = `${TEST_DATE}-${TEST_SLUG}`;
const testPostPath = path.join(blogDir, `${TEST_ID}.md`);
const testPostRel = path.relative(repoRoot, testPostPath);

const INPUT_SLUG = 'qa-draft-input-test';
const INPUT_ID = `${TEST_DATE}-${INPUT_SLUG}`;
const inputPostPath = path.join(blogDir, `${INPUT_ID}.md`);

const results = [];

function record(name, passed, detail = '') {
	results.push({ name, passed, detail });
	const icon = passed ? 'PASS' : 'FAIL';
	console.log(`[${icon}] ${name}${detail ? ` — ${detail}` : ''}`);
}

// 비동기로 돌려야 Ctrl+C 를 받았을 때 바로 정리 처리기가 돈다(spawnSync 중에는 처리기가 못 돈다).
function runCmd(cmd, args) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, { cwd: repoRoot, env: { ...process.env, INIT_CWD: repoRoot } });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (d) => (stdout += d));
		child.stderr.on('data', (d) => (stderr += d));
		child.on('error', (err) => resolve({ status: null, stdout, stderr: stderr + String(err) }));
		child.on('close', (status) => resolve({ status, stdout, stderr }));
	});
}

// 임시 폴더에 빌드한다. 저장소의 dist/ 는 그대로 둔다.
let buildCount = 0;
function runBuild() {
	buildCount += 1;
	distDir = path.join(tmpDir, `dist-${buildCount}`);
	return runCmd('npm', ['run', 'build', '--', '--outDir', distDir]);
}

// 저장소 dist/ 가 시험 전후로 같은지 비교하기 위한 지문 (파일 경로·크기·수정 시각)
function distSignature() {
	if (!existsSync(realDistDir)) return 'none';
	return collectFiles(realDistDir)
		.map((f) => {
			const st = statSync(f);
			return `${path.relative(realDistDir, f)}:${st.size}:${st.mtimeMs}`;
		})
		.sort()
		.join('\n');
}

function collectFiles(dir, predicate = () => true) {
	if (!existsSync(dir)) return [];
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...collectFiles(full, predicate));
		} else if (entry.isFile() && predicate(full)) {
			out.push(full);
		}
	}
	return out;
}

function todayString() {
	const now = new Date();
	return [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, '0'),
		String(now.getDate()).padStart(2, '0'),
	].join('-');
}

let tmpDir = null;

function cleanup() {
	rmSync(testPostPath, { force: true });
	rmSync(inputPostPath, { force: true });
	if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		cleanup();
		console.error(`\n${signal} 를 받아 멈춥니다. 시험 글과 임시 폴더는 지웠습니다.`);
		process.exit(130);
	});
}

if (existsSync(realDistDir)) {
	console.log('알림: 저장소에 dist/ 가 있습니다. 이 시험은 dist/ 를 건드리지 않습니다(임시 폴더에 빌드).');
}
const distBefore = distSignature();

try {
	tmpDir = mkdtempSync(path.join(os.tmpdir(), 'qa-draft-test-'));
	rmSync(testPostPath, { force: true });
	rmSync(inputPostPath, { force: true });

	// 1. new-post 로 초안 생성
	const step1 = await runCmd('npm', ['run', 'new-post', '--', '--date', TEST_DATE, '--slug', TEST_SLUG]);
	const createdExists = existsSync(testPostPath);
	const createdContent = createdExists ? readFileSync(testPostPath, 'utf8') : '';
	const hasDraftTrue = /^draft:\s*true\s*$/m.test(createdContent);
	const hasPubDate = new RegExp(`^pubDate:\\s*["']?${TEST_DATE}["']?\\s*$`, 'm').test(createdContent);
	const hasHeadings =
		createdContent.includes('## TODO: 소제목 1') &&
		createdContent.includes('## TODO: 소제목 2') &&
		createdContent.includes('## TODO: 소제목 3');

	record(
		'1. new-post 초안 생성 및 머리말·소제목 확인',
		step1.status === 0 && createdExists && hasDraftTrue && hasPubDate && hasHeadings,
		step1.status !== 0
			? `exit=${step1.status}`
			: `exists=${createdExists}, draft=${hasDraftTrue}, pubDate=${hasPubDate}, headings=${hasHeadings}`,
	);

	// 2. 같은 명령 재실행 시 실패 및 내용 보존
	if (createdExists) {
		const sentinel = `${createdContent}\n<!-- sentinel-keep -->\n`;
		writeFileSync(testPostPath, sentinel, 'utf8');
		const step2 = await runCmd('npm', ['run', 'new-post', '--', '--date', TEST_DATE, '--slug', TEST_SLUG]);
		const afterContent = readFileSync(testPostPath, 'utf8');
		record(
			'2. 같은 파일 재생성 시 덮어쓰지 않고 실패',
			step2.status !== 0 && afterContent === sentinel,
			`exit=${step2.status}, preserved=${afterContent === sentinel}`,
		);
		// 원래 내용 복원
		writeFileSync(testPostPath, createdContent, 'utf8');
	} else {
		record('2. 같은 파일 재생성 시 덮어쓰지 않고 실패', false, '1단계 파일이 생성되지 않음');
	}

	// 3. 초안 상태에서 npm run build → 초안이 결과물에 없어야 함 + 기존 글은 유지
	// tags 경로(dist/tags/**)까지 검증하기 위해 초안에 시험용 태그를 넣는다.
	if (createdExists) {
		const withTag = createdContent.replace(/^tags:\s*\[\]\s*$/m, 'tags: ["qa-draft-tag"]');
		writeFileSync(testPostPath, withTag, 'utf8');
	}
	const buildDraft = await runBuild();
	record('3-a. 초안 상태에서 npm run build 성공', buildDraft.status === 0, `exit=${buildDraft.status}`);

	if (buildDraft.status === 0) {
		const blogIndex = existsSync(path.join(distDir, 'blog', 'index.html'))
			? readFileSync(path.join(distDir, 'blog', 'index.html'), 'utf8')
			: '';
		const rssXml = existsSync(path.join(distDir, 'rss.xml'))
			? readFileSync(path.join(distDir, 'rss.xml'), 'utf8')
			: '';
		const sitemapFiles = collectFiles(distDir, (f) => /^sitemap-.*\.xml$/.test(path.basename(f)));
		const sitemapHit = sitemapFiles.some((f) => readFileSync(f, 'utf8').includes(TEST_SLUG));
		const categoryFiles = collectFiles(path.join(distDir, 'categories'));
		const categoryHit = categoryFiles.some((f) => readFileSync(f, 'utf8').includes(TEST_SLUG));
		const tagFiles = collectFiles(path.join(distDir, 'tags'));
		const tagHit = tagFiles.some(
			(f) => readFileSync(f, 'utf8').includes(TEST_SLUG) || f.includes('qa-draft-tag'),
		);
		const ogExists = existsSync(path.join(distDir, 'og', `${TEST_ID}.png`));
		const postDirExists = existsSync(path.join(distDir, 'blog', TEST_ID));

		const leakedLocations = [];
		if (blogIndex.includes(TEST_SLUG)) leakedLocations.push('dist/blog/index.html');
		if (rssXml.includes(TEST_SLUG)) leakedLocations.push('dist/rss.xml');
		if (sitemapHit) leakedLocations.push('dist/sitemap-*.xml');
		if (categoryHit) leakedLocations.push('dist/categories/**');
		if (tagHit) leakedLocations.push('dist/tags/**');
		if (ogExists) leakedLocations.push(`dist/og/${TEST_ID}.png`);
		if (postDirExists) leakedLocations.push(`dist/blog/${TEST_ID}/`);

		record(
			'3-b. 운영 빌드 결과물에서 초안 제외 (목록·rss·sitemap·카테고리·태그·og·개별글)',
			leakedLocations.length === 0,
			leakedLocations.length === 0 ? '모든 경로에서 제외됨' : `노출된 곳: ${leakedLocations.join(', ')}`,
		);

		// draft 칸이 아예 없는 기존 글(welcome.md)은 계속 공개되어야 함
		const existingPostOk =
			existsSync(path.join(distDir, 'blog', 'welcome', 'index.html')) &&
			blogIndex.includes('/blog/welcome') &&
			rssXml.includes('/blog/welcome/');
		record(
			'3-c. draft 칸이 없는 기존 글(welcome)은 계속 공개됨',
			existingPostOk,
			`welcome page=${existsSync(path.join(distDir, 'blog', 'welcome', 'index.html'))}`,
		);
	} else {
		record('3-b. 운영 빌드 결과물에서 초안 제외', false, '빌드 실패로 확인 불가');
		record('3-c. draft 칸이 없는 기존 글(welcome)은 계속 공개됨', false, '빌드 실패로 확인 불가');
	}

	// 4-a. TODO: 자리 표시가 남은 채로는 발행이 거부되고 파일이 그대로여야 함
	const today = todayString();
	const beforeRefuse = existsSync(testPostPath) ? readFileSync(testPostPath, 'utf8') : '';
	const refuse = await runCmd('npm', ['run', 'publish-post', '--', testPostRel]);
	const afterRefuse = existsSync(testPostPath) ? readFileSync(testPostPath, 'utf8') : '';
	record(
		'4-a. TODO: 자리 표시가 남아 있으면 publish-post 거부 (파일 그대로)',
		refuse.status !== 0 && beforeRefuse !== '' && afterRefuse === beforeRefuse,
		`exit=${refuse.status}, unchanged=${afterRefuse === beforeRefuse}`,
	);

	// 4-b. 머리말만 채우고 소제목은 "## 소제목 N" 그대로(TODO: 만 지움)여도 거부되어야 함
	if (existsSync(testPostPath)) {
		const frontOnly = readFileSync(testPostPath, 'utf8')
			.replace(/"TODO: [^"]*"/g, '"QA 시험 값"')
			.replace(/^## TODO: (소제목 \d)$/gm, '## $1');
		writeFileSync(testPostPath, frontOnly, 'utf8');
	}
	const beforeHeadingRefuse = existsSync(testPostPath) ? readFileSync(testPostPath, 'utf8') : '';
	const headingRefuse = await runCmd('npm', ['run', 'publish-post', '--', testPostRel]);
	const afterHeadingRefuse = existsSync(testPostPath) ? readFileSync(testPostPath, 'utf8') : '';
	record(
		'4-b. 머리말만 채우고 소제목(## 소제목 N)이 남아 있으면 publish-post 거부 (파일 그대로)',
		headingRefuse.status !== 0 &&
			!beforeHeadingRefuse.includes('TODO:') &&
			/^## 소제목 1$/m.test(beforeHeadingRefuse) &&
			afterHeadingRefuse === beforeHeadingRefuse,
		`exit=${headingRefuse.status}, unchanged=${afterHeadingRefuse === beforeHeadingRefuse}`,
	);

	// 4. 소제목까지 채운 뒤 publish-post 실행 → draft: false, pubDate: 오늘
	// draft 줄 끝에 YAML 주석이 붙어 있어도 바뀌어야 한다.
	if (existsSync(testPostPath)) {
		const filled = readFileSync(testPostPath, 'utf8')
			.replace(/^## 소제목 (\d)$/gm, '## QA 시험 소제목 $1')
			.replace(/^draft:\s*true\s*$/m, 'draft: true # 아침에 확인');
		writeFileSync(testPostPath, filled, 'utf8');
	}
	const step4 = await runCmd('npm', ['run', 'publish-post', '--', testPostRel]);
	const publishedContent = existsSync(testPostPath) ? readFileSync(testPostPath, 'utf8') : '';
	const isDraftFalse = /^draft:\s*false\s*(#.*)?$/m.test(publishedContent);
	const isPubDateToday = new RegExp(`^pubDate:\\s*["']?${today}["']?\\s*$`, 'm').test(publishedContent);

	record(
		'4. publish-post 실행 시 draft: false 및 pubDate 오늘로 변경',
		step4.status === 0 && isDraftFalse && isPubDateToday,
		`exit=${step4.status}, draftFalse=${isDraftFalse}, pubDateToday=${isPubDateToday} (${today})`,
	);

	// 5. 발행 후 다시 npm run build → 목록·rss·sitemap·og·폴더에 나타남
	const buildPublished = await runBuild();
	if (buildPublished.status === 0) {
		const blogIndex = existsSync(path.join(distDir, 'blog', 'index.html'))
			? readFileSync(path.join(distDir, 'blog', 'index.html'), 'utf8')
			: '';
		const rssXml = existsSync(path.join(distDir, 'rss.xml'))
			? readFileSync(path.join(distDir, 'rss.xml'), 'utf8')
			: '';
		const sitemapFiles = collectFiles(distDir, (f) => /^sitemap-.*\.xml$/.test(path.basename(f)));
		const inBlogIndex = blogIndex.includes(TEST_ID);
		const inRss = rssXml.includes(TEST_ID);
		const inSitemap = sitemapFiles.some((f) => readFileSync(f, 'utf8').includes(TEST_ID));
		const ogExists = existsSync(path.join(distDir, 'og', `${TEST_ID}.png`));
		const postPageExists = existsSync(path.join(distDir, 'blog', TEST_ID, 'index.html'));

		record(
			'5. 발행 후 빌드 결과물(목록·rss·sitemap·og·개별글)에 노출',
			inBlogIndex && inRss && inSitemap && ogExists && postPageExists,
			`blogIndex=${inBlogIndex}, rss=${inRss}, sitemap=${inSitemap}, og=${ogExists}, page=${postPageExists}`,
		);
	} else {
		record('5. 발행 후 빌드 결과물에 노출', false, `빌드 실패 exit=${buildPublished.status}`);
	}

	// 6. 깨질 만한 경우(예외 입력) 시험
	const badDate1 = await runCmd('npm', ['run', 'new-post', '--', '--date', '2026-1-1', '--slug', 'bad-date']);
	const badDate2 = await runCmd('npm', ['run', 'new-post', '--', '--date', '2026-02-30', '--slug', 'bad-date']);
	record(
		'6-a. 잘못된 --date 형식(2026-1-1, 2026-02-30) 거부',
		badDate1.status !== 0 && badDate2.status !== 0,
		`2026-1-1 exit=${badDate1.status}, 2026-02-30 exit=${badDate2.status}`,
	);

	const badSlugs = ['has space', 'UpperCase', '한글슬러그', '-leading', 'trailing-', 'double--dash', ''];
	const slugChecks = [];
	for (const s of badSlugs) {
		const res = await runCmd('npm', ['run', 'new-post', '--', '--date', TEST_DATE, '--slug', s]);
		slugChecks.push({ slug: s, failed: res.status !== 0 });
	}
	record(
		'6-b. 잘못된 --slug(공백·대문자·한글·하이픈 오류·빈 값) 거부',
		slugChecks.every((c) => c.failed),
		slugChecks.map((c) => `${JSON.stringify(c.slug)}:${c.failed ? 'OK' : 'NG'}`).join(', '),
	);

	const missingInput = await runCmd('npm', [
		'run',
		'new-post',
		'--',
		'--date',
		TEST_DATE,
		'--slug',
		'missing-input-slug',
		'--input',
		path.join(tmpDir, 'no-such-file.md'),
	]);
	record(
		'6-c. --input 에 없는 파일 지정 시 실패',
		missingInput.status !== 0 && !existsSync(path.join(blogDir, `${TEST_DATE}-missing-input-slug.md`)),
		`exit=${missingInput.status}`,
	);

	// --input 정상 재료 파일 및 긴 글/주석 닫힘(-->) 이스케이프 확인
	const materialFile = path.join(tmpDir, 'material.md');
	const longLine = '가'.repeat(5000);
	writeFileSync(materialFile, `재료 첫 줄\n위험한 주석 닫기 --> 포함\n${longLine}\n`, 'utf8');
	const withInput = await runCmd('npm', [
		'run',
		'new-post',
		'--',
		'--date',
		TEST_DATE,
		'--slug',
		INPUT_SLUG,
		'--input',
		materialFile,
	]);
	const inputPostContent = existsSync(inputPostPath) ? readFileSync(inputPostPath, 'utf8') : '';
	const inputCommentSafe =
		inputPostContent.includes('<!-- 재료') &&
		inputPostContent.includes('-- >') &&
		inputPostContent.includes(longLine);
	record(
		'6-d. --input 긴 재료 파일 첨부 및 --> 주석 탈출 방어',
		withInput.status === 0 && inputCommentSafe,
		`exit=${withInput.status}, commentSafe=${inputCommentSafe}`,
	);

	// publish-post 예외: 없는 파일, 머리말 없는 파일, pubDate 없는 파일
	const pubMissing = await runCmd('npm', ['run', 'publish-post', '--', path.join(tmpDir, 'missing.md')]);
	const noFrontmatterFile = path.join(tmpDir, 'no-frontmatter.md');
	writeFileSync(noFrontmatterFile, '# 머리말이 없는 일반 마크다운 파일\n본문입니다.\n', 'utf8');
	const pubNoFrontmatter = await runCmd('npm', ['run', 'publish-post', '--', noFrontmatterFile]);

	const noPubDateFile = path.join(tmpDir, 'no-pubdate.md');
	writeFileSync(noPubDateFile, '---\ntitle: "제목"\ndraft: true\n---\n본문\n', 'utf8');
	const pubNoPubDate = await runCmd('npm', ['run', 'publish-post', '--', noPubDateFile]);

	const pubNoArg = await runCmd('npm', ['run', 'publish-post']);

	record(
		'6-e. publish-post 에 인자 없음·없는 파일·머리말 없는 파일·pubDate 없는 파일 실패',
		pubNoArg.status !== 0 &&
			pubMissing.status !== 0 &&
			pubNoFrontmatter.status !== 0 &&
			pubNoPubDate.status !== 0,
		`noArg=${pubNoArg.status}, missing=${pubMissing.status}, noFrontmatter=${pubNoFrontmatter.status}, noPubDate=${pubNoPubDate.status}`,
	);

	// 재료 주석이 남은 파일은 거부, --force 면 발행
	const materialLeft = path.join(tmpDir, 'material-left.md');
	writeFileSync(materialLeft, `---\ntitle: "제목"\npubDate: "${TEST_DATE}"\ndraft: true\n---\n본문\n<!-- 재료\n메모\n-->\n`, 'utf8');
	const pubMaterial = await runCmd('npm', ['run', 'publish-post', '--', materialLeft]);
	const stillDraft = /^draft: true$/m.test(readFileSync(materialLeft, 'utf8'));
	const pubForce = await runCmd('npm', ['run', 'publish-post', '--', materialLeft, '--force']);
	const forcedFalse = /^draft: false$/m.test(readFileSync(materialLeft, 'utf8'));
	record(
		'6-g. <!-- 재료 주석이 남으면 거부, --force 면 발행',
		pubMaterial.status !== 0 && stillDraft && pubForce.status === 0 && forcedFalse,
		`refuse=${pubMaterial.status}, stillDraft=${stillDraft}, force=${pubForce.status}, forcedFalse=${forcedFalse}`,
	);

	// draft 값을 읽지 못하면 "이미 false" 라고 넘어가지 말고 실패해야 함
	const badDraft = path.join(tmpDir, 'bad-draft.md');
	writeFileSync(badDraft, `---\ntitle: "제목"\npubDate: "${TEST_DATE}"\ndraft: yes\n---\n본문\n`, 'utf8');
	const pubBadDraft = await runCmd('npm', ['run', 'publish-post', '--', badDraft]);
	record('6-h. 읽을 수 없는 draft 값(draft: yes)이면 실패', pubBadDraft.status !== 0, `exit=${pubBadDraft.status}`);

	// 쓰기 권한이 없는 파일(0444)에 publish-post 실행 시 실패 확인
	const roFile = path.join(tmpDir, 'readonly-post.md');
	writeFileSync(roFile, `---\ntitle: "읽기전용"\npubDate: "${TEST_DATE}"\ndraft: true\n---\n본문\n`, {
		encoding: 'utf8',
		mode: 0o444,
	});
	const pubReadOnly = await runCmd('npm', ['run', 'publish-post', '--', roFile]);
	record(
		'6-f. 쓰기 권한 없는 파일(0444) publish-post 실행 시 실패',
		pubReadOnly.status !== 0,
		`exit=${pubReadOnly.status}`,
	);
} finally {
	// 만든 시험 글과 임시 폴더(임시 빌드 결과물 포함) 정리
	cleanup();
}

const postsGone = !existsSync(testPostPath) && !existsSync(inputPostPath);
const tmpGone = !tmpDir || !existsSync(tmpDir);
const distUntouched = distSignature() === distBefore;
record(
	'7. 시험 종료 후 시험 글·임시 폴더 정리, 저장소 dist/ 는 그대로',
	postsGone && tmpGone && distUntouched,
	`postsGone=${postsGone}, tmpGone=${tmpGone}, distUntouched=${distUntouched}`,
);

const failed = results.filter((r) => !r.passed);
console.log(`\n총 ${results.length}개 항목 중 ${results.length - failed.length}개 통과, ${failed.length}개 실패`);
if (failed.length > 0) {
	process.exit(1);
}

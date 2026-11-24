import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dateParts } from '../src/lib/posts-pure.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NEW_POST = join(REPO_ROOT, 'scripts', 'new-post.mjs');
const PUBLISH_POST = join(REPO_ROOT, 'scripts', 'publish-post.mjs');

// 실제 src/content/blog 는 건드리지 않는다: new-post 는 임시 폴더로 복사해서 돌리고,
// publish-post 는 넘겨 받은 파일만 고치므로 임시 파일에 바로 돌린다.
function withTempWorkspace(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'blog-publish-post-test-'));
	mkdirSync(join(dir, 'scripts'));
	const newPost = join(dir, 'scripts', 'new-post.mjs');
	copyFileSync(NEW_POST, newPost);
	const run = (script, args) =>
		spawnSync(process.execPath, [script, ...args], {
			cwd: dir,
			encoding: 'utf8',
			env: { ...process.env, INIT_CWD: dir },
		});
	try {
		return fn({
			dir,
			newPost: (args) => run(newPost, args),
			publish: (args) => run(PUBLISH_POST, args),
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function todaySeoul() {
	const { year, month, day } = dateParts(new Date());
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const FILLED = `---
title: '다 쓴 글'
description: '한 줄 요약'
pubDate: '2026-11-11'
category: '회고'
tags: []
draft: true # 확인 전
---

## 무슨 일이 있었나

배포가 멈췄다.

\`\`\`bash
# 코드 블록 안의 주석 줄
# 은 소제목이 아니다
\`\`\`

## 다음에는

먼저 로그를 본다.
`;

describe('new-post --input', () => {
	test('재료를 글 끝 HTML 주석으로 붙이고, 안의 --> 는 주석을 닫지 못하게 바꾼다', () => {
		withTempWorkspace(({ dir, newPost }) => {
			writeFileSync(join(dir, '재료.md'), '- 배포 고침\n<!-- 안쪽 --> 끝\n', 'utf8');
			const res = newPost(['--title', 'Daily', '--category', '회고', '--date', '2026-11-11', '--input', '재료.md']);
			assert.equal(res.status, 0, res.stderr);
			const text = readFileSync(join(dir, 'src/content/blog/2026/11/2026-11-11-daily.md'), 'utf8');
			assert.match(text, /draft: true/);
			assert.ok(text.endsWith('<!-- 재료\n- 배포 고침\n<!-- 안쪽 -- > 끝\n-->\n'), text);
			assert.equal(text.match(/-->/g).length, 1, '주석을 닫는 --> 는 맨 끝 하나뿐이어야 합니다.');
		});
	});

	test('재료 파일이 없으면 실패하고 글을 만들지 않는다', () => {
		withTempWorkspace(({ dir, newPost }) => {
			const res = newPost(['--title', 'Daily', '--category', '회고', '--date', '2026-11-11', '--input', '없음.md']);
			assert.notEqual(res.status, 0);
			assert.match(res.stderr, /재료 파일이 없습니다/);
			assert.throws(() => readFileSync(join(dir, 'src/content/blog/2026/11/2026-11-11-daily.md')));
		});
	});
});

describe('publish-post', () => {
	test('new-post 틀 그대로면(빈 요약·빈 소제목·재료) 발행하지 않고 파일도 바꾸지 않는다', () => {
		withTempWorkspace(({ dir, newPost, publish }) => {
			writeFileSync(join(dir, '재료.md'), '오늘 한 일', 'utf8');
			assert.equal(
				newPost(['--title', 'Daily', '--category', '회고', '--date', '2026-11-11', '--input', '재료.md']).status,
				0,
			);
			const file = join(dir, 'src/content/blog/2026/11/2026-11-11-daily.md');
			const before = readFileSync(file, 'utf8');

			const res = publish([file]);
			assert.notEqual(res.status, 0);
			assert.match(res.stderr, /빈 description/);
			assert.match(res.stderr, /내용 없는 소제목\(## 무슨 일이 있었나 \/ .*## 다음에는\)/);
			assert.match(res.stderr, /<!-- 재료 주석/);
			assert.equal(readFileSync(file, 'utf8'), before);
		});
	});

	test('다 쓴 초안은 draft: false 와 오늘(서울) pubDate 로 바꾸고 나머지는 그대로 둔다', () => {
		withTempWorkspace(({ dir, publish }) => {
			const file = join(dir, 'post.md');
			writeFileSync(file, FILLED, 'utf8');
			const res = publish(['post.md']); // INIT_CWD 기준 상대 경로
			assert.equal(res.status, 0, res.stderr);
			const expected = FILLED.replace("pubDate: '2026-11-11'", `pubDate: '${todaySeoul()}'`).replace(
				'draft: true # 확인 전',
				'draft: false # 확인 전',
			);
			assert.equal(readFileSync(file, 'utf8'), expected);
		});
	});

	test('남은 재료 주석은 --force 로만 넘긴다', () => {
		withTempWorkspace(({ dir, publish }) => {
			const file = join(dir, 'post.md');
			writeFileSync(file, `${FILLED}\n<!-- 재료\n메모\n-->\n`, 'utf8');
			assert.notEqual(publish([file]).status, 0);
			const forced = publish([file, '--force']);
			assert.equal(forced.status, 0, forced.stderr);
			assert.match(readFileSync(file, 'utf8'), /^draft: false/m);
		});
	});

	test('파일이 없거나 인자가 틀리면 실패한다', () => {
		withTempWorkspace(({ publish }) => {
			assert.notEqual(publish([]).status, 0);
			assert.notEqual(publish(['없는파일.md']).status, 0);
			assert.notEqual(publish(['a.md', 'b.md']).status, 0);
			assert.notEqual(publish(['a.md', '--모름']).status, 0);
		});
	});
});

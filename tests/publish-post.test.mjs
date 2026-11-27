import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
	const defaultBlocklist = join(dir, 'no-blocklist.txt');
	mkdirSync(join(dir, 'scripts'));
	const newPost = join(dir, 'scripts', 'new-post.mjs');
	copyFileSync(NEW_POST, newPost);
	const run = (script, args, env = {}) =>
		spawnSync(process.execPath, [script, ...args], {
			cwd: dir,
			encoding: 'utf8',
			env: { ...process.env, INIT_CWD: dir, BLOG_BLOCKLIST: defaultBlocklist, ...env },
		});
	try {
		return fn({
			dir,
			defaultBlocklist,
			newPost: (args, env) => run(newPost, args, env),
			publish: (args, env) => run(PUBLISH_POST, args, env),
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
	test('외부 목록의 금지어는 대소문자와 관계없이 발행을 막고 줄번호를 보여 준다', () => {
		withTempWorkspace(({ dir, publish }) => {
			const blocklist = join(dir, 'blocklist.txt');
			writeFileSync(blocklist, '# 주석\n\n  AcmeTest  \n', 'utf8');
			const file = join(dir, 'post.md');
			const before = `${FILLED}고객사 acmetest 테스트 본문\n`;
			writeFileSync(file, before, 'utf8');

			const res = publish([file], { BLOG_BLOCKLIST: blocklist });
			assert.notEqual(res.status, 0);
			assert.ok(res.stderr.includes('금지어'), res.stderr);
			assert.ok(res.stderr.includes(`${FILLED.split('\n').length}째 줄`), res.stderr);
			assert.deepEqual(readFileSync(file), Buffer.from(before));
		});
	});

	test('가짜 토큰은 --force 로도 막고 --allow-sensitive 를 쓰면 경고 후 발행한다', () => {
		withTempWorkspace(({ dir, publish }) => {
			const file = join(dir, 'post.md');
			const token = 'ghp_' + 'a'.repeat(36);
			const before = `${FILLED}<!-- ${token} -->\n`;
			writeFileSync(file, before, 'utf8');

			const blocked = publish([file, '--force']);
			assert.notEqual(blocked.status, 0);
			assert.match(blocked.stderr, /GitHub 토큰 「ghp_aa…」/);
			assert.ok(!blocked.stderr.includes(token));
			assert.deepEqual(readFileSync(file), Buffer.from(before));

			const allowed = publish([file, '--allow-sensitive']);
			assert.equal(allowed.status, 0, allowed.stderr);
			assert.match(allowed.stderr, /주의: --allow-sensitive/);
			assert.ok(!allowed.stderr.includes(token));
			assert.match(readFileSync(file, 'utf8'), /^draft: false/m);
		});
	});

	test('금지어 목록 파일이 있어도 걸리는 말이 없는 깨끗한 글은 발행된다', () => {
		withTempWorkspace(({ dir, publish }) => {
			const blocklist = join(dir, 'blocklist.txt');
			writeFileSync(blocklist, '# 주석\n\n  AcmeTest  \n', 'utf8');
			const file = join(dir, 'post.md');
			writeFileSync(file, FILLED, 'utf8');

			const res = publish([file], { BLOG_BLOCKLIST: blocklist });
			assert.equal(res.status, 0, res.stderr);
			assert.ok(!res.stderr.includes('금지어 목록 없음'), res.stderr);
			const expected = FILLED.replace("pubDate: '2026-11-11'", `pubDate: '${todaySeoul()}'`).replace(
				'draft: true # 확인 전',
				'draft: false # 확인 전',
			);
			assert.equal(readFileSync(file, 'utf8'), expected);
		});
	});

	test('금지어 목록 파일이 없으면 경고하고 깨끗한 글을 발행한다', () => {
		withTempWorkspace(({ dir, defaultBlocklist, publish }) => {
			const file = join(dir, 'post.md');
			writeFileSync(file, FILLED, 'utf8');
			const res = publish([file]);
			assert.equal(res.status, 0, res.stderr);
			assert.ok(res.stderr.includes(`금지어 목록 없음: ${defaultBlocklist}`), res.stderr);
			assert.match(readFileSync(file, 'utf8'), /^draft: false/m);
		});
	});

	test('목록 파일이 비었거나 주석만 있으면 깨끗한 글은 통과한다', () => {
		for (const content of ['', '# 주석만 있음\n\n   # 빈 줄과 주석만\n']) {
			withTempWorkspace(({ dir, publish }) => {
				const blocklist = join(dir, 'blocklist.txt');
				writeFileSync(blocklist, content, 'utf8');
				const file = join(dir, 'post.md');
				writeFileSync(file, FILLED, 'utf8');

				const res = publish([file], { BLOG_BLOCKLIST: blocklist });
				assert.equal(res.status, 0, res.stderr);
				assert.match(readFileSync(file, 'utf8'), /^draft: false/m);
			});
		}
	});

	test('내부 IP·이메일·개인 키·API/AWS 키는 막고, 범위 밖 IP(172.32.0.1)는 통과한다', () => {
		const blockedCases = [
			{ name: '내부 IP 192.168.0.1', snippet: '192.168.0.1', expectedStderr: /내부 IP/ },
			{ name: '내부 IP 10.0.0.1', snippet: '10.0.0.1', expectedStderr: /내부 IP/ },
			{ name: '내부 IP 172.16.0.1', snippet: '172.16.0.1', expectedStderr: /내부 IP/ },
			{ name: '이메일', snippet: 'dev@example.test', expectedStderr: /이메일/ },
			{ name: '개인 키', snippet: '-----BEGIN OPENSSH PRIVATE KEY-----', expectedStderr: /개인 키/ },
			{ name: 'API 키', snippet: 'sk-' + 'x'.repeat(20), expectedStderr: /API 키 「sk-xxx…」/ },
			{ name: 'AWS 키', snippet: 'AKIA' + 'A'.repeat(16), expectedStderr: /AWS 키 「AKIAAA…」/ },
		];
		for (const { name, snippet, expectedStderr } of blockedCases) {
			withTempWorkspace(({ dir, publish }) => {
				const file = join(dir, 'post.md');
				const before = `${FILLED}테스트: ${snippet}\n`;
				writeFileSync(file, before, 'utf8');
				const res = publish([file]);
				assert.notEqual(res.status, 0, `${name} 은(는) 차단되어야 합니다.`);
				assert.match(res.stderr, expectedStderr);
				assert.deepEqual(readFileSync(file), Buffer.from(before));
			});
		}

		for (const publicIp of ['172.32.0.1', '172.15.0.1']) {
			withTempWorkspace(({ dir, publish }) => {
				const file = join(dir, 'post.md');
				writeFileSync(file, `${FILLED}공인 대역 예시: ${publicIp}\n`, 'utf8');
				const res = publish([file]);
				assert.equal(res.status, 0, `${publicIp} 는 통과해야 합니다: ${res.stderr}`);
				assert.match(readFileSync(file, 'utf8'), /^draft: false/m);
			});
		}
	});

	test('긴 글 끝의 금지어도 정확한 줄번호로 막고, 깨끗한 긴 글은 발행한다', () => {
		withTempWorkspace(({ dir, publish }) => {
			const blocklist = join(dir, 'blocklist.txt');
			writeFileSync(blocklist, 'AcmeTest\n', 'utf8');
			const fillerLines = Array.from({ length: 1200 }, (_, i) => `본문 문단 ${i + 1}번째 줄입니다.`).join('\n');

			const dirtyFile = join(dir, 'dirty-long.md');
			const dirtyBefore = `${FILLED}${fillerLines}\n마지막 줄 acmetest 포함\n`;
			writeFileSync(dirtyFile, dirtyBefore, 'utf8');
			const dirtyRes = publish([dirtyFile], { BLOG_BLOCKLIST: blocklist });
			assert.notEqual(dirtyRes.status, 0);
			const expectedLine = dirtyBefore.split('\n').length - 1;
			assert.ok(dirtyRes.stderr.includes(`${expectedLine}째 줄`), dirtyRes.stderr);
			assert.deepEqual(readFileSync(dirtyFile), Buffer.from(dirtyBefore));

			const cleanFile = join(dir, 'clean-long.md');
			writeFileSync(cleanFile, `${FILLED}${fillerLines}\n`, 'utf8');
			const cleanRes = publish([cleanFile], { BLOG_BLOCKLIST: blocklist });
			assert.equal(cleanRes.status, 0, cleanRes.stderr);
			assert.match(readFileSync(cleanFile, 'utf8'), /^draft: false/m);
		});
	});

	test('금지어 목록 파일에 읽기 권한이 없으면 실패하고 글 파일을 건드리지 않는다', (t) => {
		if (typeof process.getuid === 'function' && process.getuid() === 0) {
			t.skip('root 계정에서는 읽기 전용 파일 권한 제한이 적용되지 않음');
			return;
		}
		withTempWorkspace(({ dir, publish }) => {
			const blocklist = join(dir, 'unreadable-blocklist.txt');
			writeFileSync(blocklist, 'AcmeTest\n', 'utf8');
			chmodSync(blocklist, 0o000);
			const file = join(dir, 'post.md');
			writeFileSync(file, FILLED, 'utf8');
			try {
				const res = publish([file], { BLOG_BLOCKLIST: blocklist });
				assert.notEqual(res.status, 0);
				assert.match(res.stderr, /금지어 목록을 읽을 수 없습니다/);
				assert.equal(readFileSync(file, 'utf8'), FILLED);
			} finally {
				chmodSync(blocklist, 0o644);
			}
		});
	});

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

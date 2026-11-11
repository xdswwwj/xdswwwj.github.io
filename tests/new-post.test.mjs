import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
	chmodSync,
	copyFileSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_SCRIPT = join(REPO_ROOT, 'scripts', 'new-post.mjs');

function withTempWorkspace(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'blog-new-post-test-'));
	const scriptsDir = join(dir, 'scripts');
	mkdirSync(scriptsDir, { recursive: true });
	const scriptPath = join(scriptsDir, 'new-post.mjs');
	copyFileSync(SOURCE_SCRIPT, scriptPath);

	const run = (args = []) =>
		spawnSync(process.execPath, [scriptPath, ...args], {
			cwd: dir,
			encoding: 'utf8',
		});

	try {
		return fn({ dir, run });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe('new-post 스크립트', () => {
	test('임시 폴더에서 파일 경로와 머리말·본문 틀을 올바르게 만든다', () => {
		withTempWorkspace(({ dir, run }) => {
			const res = run([
				'--title',
				"오늘의 기록: Astro's Test 101",
				'--category',
				'회고',
				'--date',
				'2026-11-11',
			]);
			assert.equal(res.status, 0, res.stderr);

			const expected = join(
				dir,
				'src',
				'content',
				'blog',
				'2026',
				'11',
				'2026-11-11-astro-s-test-101.md',
			);
			assert.equal(existsSync(expected), true);

			const content = readFileSync(expected, 'utf8');
			assert.match(content, /^---\n/);
			assert.match(content, /title: '오늘의 기록: Astro''s Test 101'/);
			assert.match(content, /description: ''/);
			assert.match(content, /pubDate: '2026-11-11'/);
			assert.match(content, /category: '회고'/);
			assert.match(content, /tags: \[\]/);
			assert.match(content, /draft: true/);
			assert.match(content, /## 무슨 일이 있었나/);
			assert.match(content, /## 다음에는/);
		});
	});

	test('한글만 있는 제목이면 날짜만으로 파일 이름을 만들고 긴 제목도 처리한다', () => {
		withTempWorkspace(({ dir, run }) => {
			const longKoreanTitle = '가나다라마바사아자차'.repeat(12); // 120자 한글 제목
			const res = run([
				'--title',
				longKoreanTitle,
				'--category',
				'아키텍처',
				'--date',
				'2026-03-05',
			]);
			assert.equal(res.status, 0, res.stderr);

			const expected = join(dir, 'src', 'content', 'blog', '2026', '03', '2026-03-05.md');
			assert.equal(existsSync(expected), true);
			assert.ok(readFileSync(expected, 'utf8').includes(`title: '${longKoreanTitle}'`));
		});
	});

	test('중복 실행은 실패하고 이미 있는 파일을 덮어쓰지 않는다', () => {
		withTempWorkspace(({ dir, run }) => {
			const args = [
				'--title',
				'Duplicate Check',
				'--category',
				'회고',
				'--date',
				'2026-11-11',
			];
			const first = run(args);
			assert.equal(first.status, 0, first.stderr);

			const created = join(
				dir,
				'src',
				'content',
				'blog',
				'2026',
				'11',
				'2026-11-11-duplicate-check.md',
			);
			writeFileSync(created, '직접 수정한 본문 보관 확인', 'utf8');

			const second = run(args);
			assert.notEqual(second.status, 0);
			assert.match(second.stderr, /이미 같은 파일이 있습니다/);
			assert.equal(readFileSync(created, 'utf8'), '직접 수정한 본문 보관 확인');
		});
	});

	test('빈 제목·공백 제목·누락된 필수 인자·잘못된 날짜는 실패한다', () => {
		withTempWorkspace(({ dir, run }) => {
			for (const badArgs of [
				['--title', '', '--category', '회고', '--date', '2026-11-11'],
				['--title', '   \t  ', '--category', '회고', '--date', '2026-11-11'],
				['--category', '회고', '--date', '2026-11-11'],
				['--title', '제목', '--category', '', '--date', '2026-11-11'],
				['--title', '제목', '--category', '회고', '--date', '2026-02-30'],
				['--title', '제목', '--category', '회고', '--date', '2026-11-11', '--slug', '한글만'],
			]) {
				const res = run(badArgs);
				assert.notEqual(res.status, 0, `실패해야 하는 인자: ${badArgs.join(' ')}`);
			}
			assert.equal(existsSync(join(dir, 'src', 'content', 'blog')), false);
		});
	});

	test('대상 폴더에 쓰기 권한이 없으면 실패한다', (t) => {
		if (typeof process.getuid === 'function' && process.getuid() === 0) {
			t.skip('root 계정에서는 읽기 전용 폴더 권한 제한이 적용되지 않음');
			return;
		}
		withTempWorkspace(({ dir, run }) => {
			const targetMonthDir = join(dir, 'src', 'content', 'blog', '2026', '11');
			mkdirSync(targetMonthDir, { recursive: true });
			chmodSync(targetMonthDir, 0o555);
			try {
				const res = run([
					'--title',
					'Permission Denied Post',
					'--category',
					'회고',
					'--date',
					'2026-11-11',
				]);
				assert.notEqual(res.status, 0);
			} finally {
				chmodSync(targetMonthDir, 0o755);
			}
		});
	});
});

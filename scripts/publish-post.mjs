#!/usr/bin/env node
// 초안을 발행 상태로 바꾼다: draft: true → false, pubDate → 오늘(로컬 날짜).
// 파일 이름(주소)과 본문은 바꾸지 않는다.
// 사용법: node scripts/publish-post.mjs <파일>
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = '사용법: node scripts/publish-post.mjs src/content/blog/YYYY-MM-DD-<slug>.md';

function fail(message, showUsage = false) {
	console.error(`오류: ${message}`);
	if (showUsage) console.error(`\n${USAGE}`);
	process.exit(1);
}

let positionals;
try {
	({ positionals } = parseArgs({ options: {}, strict: true, allowPositionals: true }));
} catch (err) {
	fail(err.message, true);
}
if (positionals.length !== 1) fail('파일 하나를 넘겨 주세요.', true);

// npm run 으로 부르면 cwd 가 저장소 루트로 바뀌므로, 원래 위치(INIT_CWD) 기준으로 찾는다.
const baseDir = process.env.INIT_CWD || process.cwd();
const file = path.resolve(baseDir, positionals[0]);
if (!existsSync(file)) fail(`파일이 없습니다: ${file}`);

const text = readFileSync(file, 'utf8');
const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
if (!match) fail(`머리말(--- ... ---)이 없습니다: ${file}`);

const now = new Date();
const today = [
	now.getFullYear(),
	String(now.getMonth() + 1).padStart(2, '0'),
	String(now.getDate()).padStart(2, '0'),
].join('-');

let front = match[1];

if (!/^pubDate:.*$/m.test(front)) fail('머리말에 pubDate 가 없습니다.');
front = front.replace(/^pubDate:.*$/m, `pubDate: "${today}"`);

const draftLine = front.match(/^draft:\s*(\S+)\s*$/m);
let wasDraft = false;
if (draftLine && draftLine[1].replace(/['"]/g, '') === 'true') {
	wasDraft = true;
	front = front.replace(/^draft:.*$/m, 'draft: false');
}

const output = text.slice(0, match.index) + match[0].replace(match[1], () => front) + text.slice(match.index + match[0].length);
writeFileSync(file, output, 'utf8');

const rel = path.relative(process.cwd(), file);
if (wasDraft) {
	console.log(`발행 상태로 바꿨습니다: ${rel} (draft: false, pubDate: ${today})`);
} else {
	console.log(`이미 draft 가 false 입니다. pubDate 만 ${today} 로 맞췄습니다: ${rel}`);
}

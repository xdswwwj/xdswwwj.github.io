#!/usr/bin/env node
// 초안을 발행 상태로 바꾼다: draft: true → false, pubDate → 오늘(로컬 날짜).
// 파일 이름(주소)과 본문은 바꾸지 않는다.
// 사용법: node scripts/publish-post.mjs <파일> [--force]
// TODO: 자리 표시나 <!-- 재료 주석이 남아 있으면 발행하지 않는다(--force 로만 넘길 수 있음).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const USAGE = `사용법: node scripts/publish-post.mjs src/content/blog/YYYY-MM-DD-<slug>.md [--force]
  --force  TODO: 자리 표시나 <!-- 재료 주석이 남아 있어도 발행한다.`;

function fail(message, showUsage = false) {
	console.error(`오류: ${message}`);
	if (showUsage) console.error(`\n${USAGE}`);
	process.exit(1);
}

let positionals;
let values;
try {
	({ positionals, values } = parseArgs({
		options: { force: { type: 'boolean', default: false } },
		strict: true,
		allowPositionals: true,
	}));
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

// 매일 돌리는 흐름이라, 채우지 않은 틀이나 재료가 그대로 공개되지 않게 막는다.
const leftovers = [];
if (text.includes('TODO:')) leftovers.push('TODO: 자리 표시');
if (text.includes('<!-- 재료')) leftovers.push('<!-- 재료 주석');
if (leftovers.length > 0 && !values.force) {
	fail(`아직 지우지 않은 것이 있습니다: ${leftovers.join(', ')}. 채우거나 지운 뒤 다시 실행하세요 (그래도 발행하려면 --force).`);
}

if (!/^pubDate:.*$/m.test(front)) fail('머리말에 pubDate 가 없습니다.');
front = front.replace(/^pubDate:.*$/m, `pubDate: "${today}"`);

// draft 줄: 값은 따옴표가 있어도 되고, 줄 끝 YAML 주석(# ...)도 허용한다. 주석은 그대로 둔다.
const draftRe = /^(draft:[ \t]*)(?:(['"]?)(true|false)\2)([ \t]*(?:#.*)?)$/im;
let wasDraft = false;
if (/^draft:/m.test(front)) {
	const draftLine = front.match(draftRe);
	if (!draftLine) fail(`draft 줄을 읽지 못했습니다 (true/false 여야 함): ${front.match(/^draft:.*$/m)[0]}`);
	if (draftLine[3].toLowerCase() === 'true') {
		wasDraft = true;
		front = front.replace(draftRe, (_, key, _q, _v, rest) => `${key}false${rest}`);
	}
}

const output = text.slice(0, match.index) + match[0].replace(match[1], () => front) + text.slice(match.index + match[0].length);
writeFileSync(file, output, 'utf8');

const rel = path.relative(process.cwd(), file);
if (leftovers.length > 0) console.warn(`주의: --force 로 발행합니다. 남아 있는 것: ${leftovers.join(', ')}`);
if (wasDraft) {
	console.log(`발행 상태로 바꿨습니다: ${rel} (draft: false, pubDate: ${today})`);
} else {
	console.log(`이미 draft 가 false(또는 없음)입니다. pubDate 만 ${today} 로 맞췄습니다: ${rel}`);
}

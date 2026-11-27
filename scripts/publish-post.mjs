#!/usr/bin/env node
// 초안을 발행 상태로 바꾼다: draft: true → false, pubDate → 오늘(Asia/Seoul 날짜).
// 파일 이름(주소)과 본문은 바꾸지 않는다.
// 사용법: node scripts/publish-post.mjs <파일> [--force] [--allow-sensitive]
// 빈 description, 내용 없는 소제목, TODO: 자리 표시, <!-- 재료 주석이 남아 있으면 발행하지 않는다(--force 로만 넘길 수 있음).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { dateParts } from '../src/lib/posts-pure.mjs';

const USAGE = `사용법: npm run publish-post -- src/content/blog/YYYY/MM/YYYY-MM-DD-<slug>.md [--force] [--allow-sensitive]
  --force  빈 description, 내용 없는 소제목, TODO: 자리 표시, <!-- 재료 주석이 남아 있어도 발행한다.
  --allow-sensitive  금지어·비밀 모양이 있어도 일부러 발행한다. --force 로는 못 넘긴다.`;

const SENSITIVE_PATTERNS = [
	{ kind: 'API 키', pattern: /\bsk-[A-Za-z0-9_-]{16,}/g, redact: true },
	{ kind: 'GitHub 토큰', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g, redact: true },
	{ kind: 'AWS 키', pattern: /\bAKIA[0-9A-Z]{16}\b/g, redact: true },
	{ kind: '개인 키', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
	{ kind: '내부 IP', pattern: /\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
	{ kind: '내부 IP', pattern: /\b192\.168\.\d{1,3}\.\d{1,3}\b/g },
	{ kind: '내부 IP', pattern: /\b172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}\b/g },
	{ kind: '이메일', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
];

function fail(message, showUsage = false) {
	console.error(`오류: ${message}`);
	if (showUsage) console.error(`\n${USAGE}`);
	process.exit(1);
}

function readBlocklist() {
	const file = process.env.BLOG_BLOCKLIST || path.join(homedir(), '.config/blog/blocklist.txt');
	try {
		return readFileSync(file, 'utf8').split(/\r?\n/)
			.map((word) => word.trim())
			.filter((word) => word && !word.startsWith('#'));
	} catch (err) {
		if (err.code !== 'ENOENT') fail(`금지어 목록을 읽을 수 없습니다: ${file} (${err.code})`);
		console.warn(`금지어 목록 없음: ${file} — 금지어 검사를 건너뜁니다`);
		return [];
	}
}

function findSensitive(text, blocklist) {
	const findings = [];
	for (const [index, content] of text.split(/\r?\n/).entries()) {
		const line = index + 1;
		const lowerContent = content.toLowerCase();
		for (const word of blocklist) {
			if (lowerContent.includes(word.toLowerCase())) findings.push({ line, kind: '금지어', match: word });
		}
		for (const { kind, pattern, redact } of SENSITIVE_PATTERNS) {
			for (const [match] of content.matchAll(pattern)) {
				findings.push({ line, kind, match: redact ? `${match.slice(0, 6)}…` : match });
			}
		}
	}
	return findings;
}

let positionals;
let values;
try {
	({ positionals, values } = parseArgs({
		options: {
			force: { type: 'boolean', default: false },
			'allow-sensitive': { type: 'boolean', default: false },
		},
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

// 사이트의 모든 날짜를 읽는 시간대(Asia/Seoul) 기준 오늘. 서버가 UTC 여도 아침 발행이 어제로 찍히지 않는다.
const { year, month, day } = dateParts(new Date());
const today = [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');

let front = match[1];

const sensitive = findSensitive(text, readBlocklist());
if (sensitive.length > 0) {
	const details = sensitive.map(({ line, kind, match }) => `  ${line}째 줄 · ${kind} 「${match}」`).join('\n');
	const message = `밖에 나가면 안 되는 말이 있습니다:\n${details}`;
	if (!values['allow-sensitive']) fail(message);
	console.warn(`주의: --allow-sensitive 로 검사를 넘깁니다. ${message}`);
}

// 매일 돌리는 흐름이라, 채우지 않은 틀이나 재료가 그대로 공개되지 않게 막는다.
const leftovers = [];
// new-post 는 description: '' 로 만든다. 비어 있으면 목록·검색 요약이 빈 채로 나간다.
if (!/^description:[ \t]*\S/m.test(front) || /^description:[ \t]*(''|"")[ \t]*$/m.test(front)) {
	leftovers.push('빈 description');
}
// 바로 다음 소제목(또는 글 끝)까지 내용이 없는 소제목 = 채우지 않은 틀
// (주석과 코드 블록 안의 # 줄은 소제목이 아니므로 빼고 본다)
const body = text
	.slice(match.index + match[0].length)
	.replace(/<!--[\s\S]*?-->/g, '')
	.replace(/^(```|~~~)[\s\S]*?^\1/gm, '');
const emptyHeadings = [...body.matchAll(/^(#{1,6}[ \t]+.+?)[ \t]*\r?$(?=\s*(?:^#{1,6}[ \t]|(?![\s\S])))/gm)].map((m) => m[1]);
if (emptyHeadings.length > 0) leftovers.push(`내용 없는 소제목(${emptyHeadings.join(' / ')})`);
if (text.includes('TODO:')) leftovers.push('TODO: 자리 표시');
if (text.includes('<!-- 재료')) leftovers.push('<!-- 재료 주석');
if (leftovers.length > 0 && !values.force) {
	fail(`아직 지우지 않은 것이 있습니다: ${leftovers.join(', ')}. 채우거나 지운 뒤 다시 실행하세요 (그래도 발행하려면 --force).`);
}

if (!/^pubDate:.*$/m.test(front)) fail('머리말에 pubDate 가 없습니다.');
front = front.replace(/^pubDate:.*$/m, `pubDate: '${today}'`);

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

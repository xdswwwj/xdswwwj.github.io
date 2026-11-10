#!/usr/bin/env node
// 새 essay 초안 틀을 만든다. 글 내용은 만들지 않는다(틀만).
// 사용법: node scripts/new-post.mjs --date 2026-11-11 --slug <slug> [--input 재료.md]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const USAGE = `사용법: node scripts/new-post.mjs --date YYYY-MM-DD --slug <slug> [--input 재료.md]
  --date   글 날짜 (예: 2026-11-11). 파일 이름과 pubDate 에 쓰인다.
  --slug   영문 소문자·숫자·- 만 (예: daily-note)
  --input  (선택) 재료 파일. 내용이 글 맨 아래 HTML 주석 안에 붙는다.`;

function fail(message, showUsage = false) {
	console.error(`오류: ${message}`);
	if (showUsage) console.error(`\n${USAGE}`);
	process.exit(1);
}

let values;
try {
	({ values } = parseArgs({
		options: {
			date: { type: 'string' },
			slug: { type: 'string' },
			input: { type: 'string' },
		},
		strict: true,
		allowPositionals: false,
	}));
} catch (err) {
	fail(err.message, true);
}

const { date, slug, input } = values;

function isValidDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

if (!date || !isValidDate(date)) fail('--date 는 YYYY-MM-DD 형식의 실제 날짜여야 합니다.', true);
if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
	fail('--slug 는 영문 소문자·숫자·- 만 쓸 수 있습니다 (앞뒤 - 와 -- 는 안 됨).', true);
}

// npm run 으로 부르면 cwd 가 저장소 루트로 바뀌므로, 원래 위치(INIT_CWD) 기준으로 --input 을 찾는다.
const baseDir = process.env.INIT_CWD || process.cwd();
let material = null;
if (input !== undefined) {
	const inputPath = path.resolve(baseDir, input);
	if (!existsSync(inputPath)) fail(`재료 파일이 없습니다: ${inputPath}`);
	material = readFileSync(inputPath, 'utf8');
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(repoRoot, 'src', 'content', 'blog', `${date}-${slug}.md`);

// layout·summary·closingQuestion 은 1번 카드(essay 칸, feature/jarvis-c0051)의 스키마를 따른다:
//   layout: 'default' | 'essay', summary·closingQuestion: 선택 문자열.
// 그 카드가 머지되기 전에는 이 세 칸이 스키마에 없어 빌드 때 조용히 버려진다(오류는 안 남).
// 문자열 칸은 스키마 검사를 통과하도록 TODO 자리 표시로 채운다. 소제목도 TODO: 를 붙여
// 채우지 않으면 publish-post 가 막는다.
let body = `---
title: "TODO: 제목"
description: "TODO: 한 줄 설명"
summary: "TODO: 요약"
closingQuestion: "TODO: 끝 질문"
category: "TODO: 카테고리"
tags: []
pubDate: "${date}"
layout: essay
draft: true
---

## TODO: 소제목 1

## TODO: 소제목 2

## TODO: 소제목 3
`;

if (material !== null) {
	// 재료 안의 "-->" 가 주석을 일찍 닫아 빌드 결과에 새지 않도록 막는다.
	const safe = material.replaceAll('-->', '-- >').replace(/\s+$/, '');
	body += `\n<!-- 재료\n${safe}\n-->\n`;
}

try {
	writeFileSync(target, body, { encoding: 'utf8', flag: 'wx' });
} catch (err) {
	if (err.code === 'EEXIST') fail(`같은 이름의 파일이 이미 있습니다(덮어쓰지 않음): ${path.relative(repoRoot, target)}`);
	fail(err.message);
}

console.log(`만들었습니다: ${path.relative(repoRoot, target)}`);

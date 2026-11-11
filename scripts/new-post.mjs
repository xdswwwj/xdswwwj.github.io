#!/usr/bin/env node
// 하루 1편 글 틀 만들기 (의존성 없음)
// 사용: npm run new-post -- --title "제목" --category 카테고리 [--date YYYY-MM-DD] [--slug x]
// 결과: src/content/blog/YYYY/MM/YYYY-MM-DD-<slug>.md (draft: true)

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BLOG_DIR = join(ROOT, 'src', 'content', 'blog');

const USAGE =
	'사용: npm run new-post -- --title "제목" --category 카테고리 [--date YYYY-MM-DD] [--slug x]';

function fail(message) {
	console.error(`오류: ${message}`);
	console.error(USAGE);
	process.exit(1);
}

function todayLocal() {
	const d = new Date();
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isValidDate(value) {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// 영문·숫자만 남겨 slug 를 만든다. 한글만 있으면 빈 문자열이 된다.
function slugify(value) {
	return value
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

// YAML 작은따옴표 문자열 (안의 ' 는 '' 로)
function yamlString(value) {
	return `'${value.replace(/'/g, "''")}'`;
}

let values;
try {
	({ values } = parseArgs({
		options: {
			title: { type: 'string' },
			category: { type: 'string' },
			date: { type: 'string' },
			slug: { type: 'string' },
			help: { type: 'boolean', short: 'h' },
		},
		strict: true,
		allowPositionals: false,
	}));
} catch (error) {
	fail(error.message);
}

if (values.help) {
	console.log(USAGE);
	process.exit(0);
}

const title = (values.title ?? '').trim();
if (!title) fail('--title 이 비었습니다.');

const category = (values.category ?? '').trim();
if (!category) fail('--category 가 비었습니다.');

const date = (values.date ?? todayLocal()).trim();
if (!isValidDate(date)) fail(`--date 형식이 잘못됐습니다: "${date}" (YYYY-MM-DD)`);

let slug;
if (values.slug !== undefined) {
	slug = slugify(values.slug);
	if (!slug) fail(`--slug 에 쓸 수 있는 글자(영문·숫자)가 없습니다: "${values.slug}"`);
} else {
	slug = slugify(title);
}

const [year, month] = date.split('-');
const fileName = slug ? `${date}-${slug}.md` : `${date}.md`;
const filePath = join(BLOG_DIR, year, month, fileName);

if (existsSync(filePath)) {
	fail(`이미 같은 파일이 있습니다 (덮어쓰지 않음): ${relative(ROOT, filePath)}`);
}

const content = `---
title: ${yamlString(title)}
description: ''
pubDate: '${date}'
category: ${yamlString(category)}
tags: []
draft: true
---

## 무슨 일이 있었나

## 내가 한 것

## 배운 것

## 다음에는
`;

mkdirSync(dirname(filePath), { recursive: true });
// flag 'wx': 그 사이에 파일이 생겼어도 덮어쓰지 않는다
try {
	writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
} catch (error) {
	if (error.code === 'EEXIST') fail(`이미 같은 파일이 있습니다 (덮어쓰지 않음): ${relative(ROOT, filePath)}`);
	throw error;
}

console.log(`만들었습니다: ${relative(ROOT, filePath)}`);
console.log('다 쓰면 머리말의 draft: true 를 지우거나 false 로 바꾸세요.');

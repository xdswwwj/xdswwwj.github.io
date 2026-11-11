import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	getPrevNext,
	getRelated,
	groupByMonth,
	readingTime,
} from '../src/lib/posts-pure.mjs';

function makePost(id, { pubDate, category = '아키텍처', tags = [] } = {}) {
	const data = {
		title: `제목 ${id}`,
		description: `설명 ${id}`,
		pubDate: pubDate instanceof Date ? pubDate : new Date(pubDate),
		category,
	};
	if (tags !== undefined) {
		data.tags = tags;
	}
	return { id, data };
}

describe('readingTime', () => {
	test('빈 문자열·공백·생략 입력이면 최솟값 약 1분을 반환한다', () => {
		assert.equal(readingTime(''), '약 1분');
		assert.equal(readingTime(), '약 1분');
		assert.equal(readingTime('   \n\t  '), '약 1분');
		assert.equal(readingTime('짧은 글입니다.'), '약 1분');
	});

	test('공백을 제외한 글자 수 기준으로 반올림한다', () => {
		assert.equal(readingTime('가'.repeat(749)), '약 1분');
		assert.equal(readingTime('가'.repeat(750)), '약 2분');
		assert.equal(readingTime('가 \n\t'.repeat(1000)), '약 2분');
	});

	test('아주 긴 글에서도 분 단위를 정확히 계산한다', () => {
		const veryLong = '가나다라마바사아자차'.repeat(5000); // 공백 제외 50,000자 -> 100분
		assert.equal(readingTime(veryLong), '약 100분');
	});
});

describe('groupByMonth', () => {
	test('빈 배열이면 빈 배열을 반환한다', () => {
		assert.deepEqual(groupByMonth([]), []);
	});

	test('같은 달의 여러 글을 한 묶음에 최신순으로 모으고 원본 배열을 바꾸지 않는다', () => {
		const p1 = makePost('early', { pubDate: '2026-11-02T00:00:00Z' });
		const p2 = makePost('late', { pubDate: '2026-11-25T00:00:00Z' });
		const p3 = makePost('mid', { pubDate: '2026-11-11T00:00:00Z' });
		const input = [p1, p2, p3];

		const grouped = groupByMonth(input);
		assert.equal(grouped.length, 1);
		assert.equal(grouped[0].year, 2026);
		assert.equal(grouped[0].month, 11);
		assert.deepEqual(
			grouped[0].posts.map((p) => p.id),
			['late', 'mid', 'early'],
		);
		assert.deepEqual(
			input.map((p) => p.id),
			['early', 'late', 'mid'],
		);
	});

	test('연도가 바뀌는 경우 연·월별로 나누고 최신 달부터 정렬한다', () => {
		const dec2025a = makePost('2025-12-a', { pubDate: '2025-12-10T00:00:00Z' });
		const dec2025b = makePost('2025-12-b', { pubDate: '2025-12-31T23:30:00Z' });
		const jan2026 = makePost('2026-01', { pubDate: '2026-01-01T00:00:00Z' });
		const jun2024 = makePost('2024-06', { pubDate: '2024-06-15T00:00:00Z' });

		const grouped = groupByMonth([jun2024, dec2025a, jan2026, dec2025b]);
		assert.deepEqual(
			grouped.map((g) => ({
				year: g.year,
				month: g.month,
				ids: g.posts.map((p) => p.id),
			})),
			[
				{ year: 2026, month: 1, ids: ['2026-01'] },
				{ year: 2025, month: 12, ids: ['2025-12-b', '2025-12-a'] },
				{ year: 2024, month: 6, ids: ['2024-06'] },
			],
		);
	});
});

describe('getPrevNext', () => {
	const oldest = makePost('oldest', { pubDate: '2026-01-01T00:00:00Z' });
	const middle = makePost('middle', { pubDate: '2026-06-01T00:00:00Z' });
	const newest = makePost('newest', { pubDate: '2026-11-01T00:00:00Z' });
	const unordered = [oldest, newest, middle];

	test('최신 글(첫 글)은 next가 null이고 prev는 이전 글을 가리킨다', async () => {
		const res = await getPrevNext('newest', unordered);
		assert.equal(res.next, null);
		assert.equal(res.prev?.id, 'middle');
	});

	test('가장 오래된 글(마지막 글)은 prev가 null이고 next는 다음 글을 가리킨다', async () => {
		const res = await getPrevNext('oldest', unordered);
		assert.equal(res.prev, null);
		assert.equal(res.next?.id, 'middle');
	});

	test('가운데 글은 prev와 next를 모두 반환한다', async () => {
		const res = await getPrevNext('middle', unordered);
		assert.equal(res.prev?.id, 'oldest');
		assert.equal(res.next?.id, 'newest');
	});

	test('글이 하나뿐이거나 빈 배열이거나 없는 id면 양쪽 모두 null이다', async () => {
		assert.deepEqual(await getPrevNext('oldest', [oldest]), { prev: null, next: null });
		assert.deepEqual(await getPrevNext('oldest', []), { prev: null, next: null });
		assert.deepEqual(await getPrevNext('missing', unordered), { prev: null, next: null });
	});
});

describe('getRelated', () => {
	test('태그가 없는 글(빈 배열 또는 undefined)도 오류 없이 같은 카테고리 글을 최신순으로 찾는다', async () => {
		const targetEmptyTags = makePost('target-empty', {
			pubDate: '2026-11-05T00:00:00Z',
			category: '회고',
			tags: [],
		});
		const targetMissingTags = makePost('target-undef', {
			pubDate: '2026-11-05T00:00:00Z',
			category: '회고',
			tags: undefined,
		});
		const sameCatOld = makePost('same-old', {
			pubDate: '2026-05-01T00:00:00Z',
			category: '회고',
			tags: undefined,
		});
		const sameCatNew = makePost('same-new', {
			pubDate: '2026-10-01T00:00:00Z',
			category: '회고',
			tags: ['일상'],
		});
		const otherCat = makePost('other', {
			pubDate: '2026-11-04T00:00:00Z',
			category: '아키텍처',
			tags: ['설계'],
		});

		const pool = [targetEmptyTags, sameCatOld, sameCatNew, otherCat];
		const fromEmpty = await getRelated(targetEmptyTags, 3, pool);
		assert.deepEqual(
			fromEmpty.map((p) => p.id),
			['same-new', 'same-old'],
		);

		const fromMissing = await getRelated(targetMissingTags, 3, [
			targetMissingTags,
			sameCatOld,
			otherCat,
		]);
		assert.deepEqual(
			fromMissing.map((p) => p.id),
			['same-old'],
		);

		const none = await getRelated(targetEmptyTags, 3, [targetEmptyTags, otherCat]);
		assert.deepEqual(none, []);
	});

	test('공유 태그 점수(2점)를 카테고리 점수(1점)보다 우선하고 개수 제한을 지킨다', async () => {
		const target = makePost('target', {
			pubDate: '2026-11-10T00:00:00Z',
			category: 'LLM',
			tags: ['에이전트', '평가'],
		});
		const twoTags = makePost('two-tags', {
			pubDate: '2026-01-01T00:00:00Z',
			category: '기타',
			tags: ['에이전트', '평가'], // 4점
		});
		const oneTagSameCat = makePost('one-tag-cat', {
			pubDate: '2026-02-01T00:00:00Z',
			category: 'LLM',
			tags: ['에이전트'], // 3점
		});
		const sameCatOnly = makePost('cat-only', {
			pubDate: '2026-11-09T00:00:00Z',
			category: 'LLM',
			tags: [], // 1점
		});

		const pool = [target, sameCatOnly, oneTagSameCat, twoTags];
		const top2 = await getRelated(target, 2, pool);
		assert.deepEqual(
			top2.map((p) => p.id),
			['two-tags', 'one-tag-cat'],
		);
		assert.deepEqual(await getRelated(target, 0, pool), []);
	});
});

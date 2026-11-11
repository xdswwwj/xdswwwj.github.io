/**
 * Every date on the site (month groups, list dates, post dates) is read in this one
 * time zone, so the build machine's local time zone never changes what readers see.
 */
export const SITE_TIME_ZONE = 'Asia/Seoul';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
	timeZone: SITE_TIME_ZONE,
	year: 'numeric',
	month: 'numeric',
	day: 'numeric',
});

/**
 * Calendar year/month/day of a date in SITE_TIME_ZONE.
 * @param {Date} date
 * @returns {{ year: number; month: number; day: number }}
 */
export function dateParts(date) {
	/** @type {{ year: number; month: number; day: number }} */
	const parts = { year: 0, month: 0, day: 0 };
	for (const { type, value } of partsFormatter.formatToParts(date)) {
		if (type === 'year' || type === 'month' || type === 'day') parts[type] = Number(value);
	}
	return parts;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** "11.01" */
export function formatMonthDay(date) {
	const { month, day } = dateParts(date);
	return `${pad2(month)}.${pad2(day)}`;
}

/** "2026.11.01" */
export function formatDotDate(date) {
	const { year, month, day } = dateParts(date);
	return `${year}.${pad2(month)}.${pad2(day)}`;
}

/** "2026년 11월 1일" (withYear: false → "11월 1일") */
export function formatKoreanDate(date, { withYear = true } = {}) {
	const { year, month, day } = dateParts(date);
	return withYear ? `${year}년 ${month}월 ${day}일` : `${month}월 ${day}일`;
}

export const newestFirst = (a, b) =>
	b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

/** Korean reading estimate, excluding whitespace, at about 500 characters/minute. */
export function readingTime(body = '') {
	const minutes = Math.max(1, Math.round(String(body ?? '').replace(/\s/g, '').length / 500));
	return `약 ${minutes}분`;
}

/** Previous means older; next means newer. Missing neighbours are null. */
export async function getPrevNext(id, posts = []) {
	const sorted = [...posts].sort(newestFirst);
	const index = sorted.findIndex((post) => post.id === id);
	return {
		prev: index < 0 ? null : sorted[index + 1] ?? null,
		next: index < 0 ? null : sorted[index - 1] ?? null,
	};
}

/** Newest months first, in SITE_TIME_ZONE (same zone as every displayed date). */
export function groupByMonth(posts) {
	const groups = new Map();
	for (const post of [...posts].sort(newestFirst)) {
		const { year, month } = dateParts(post.data.pubDate);
		const key = `${year}-${month}`;
		if (!groups.has(key)) groups.set(key, { year, month, posts: [] });
		groups.get(key).posts.push(post);
	}
	return [...groups.values()];
}

/** Shared tags: 2 points each; same category: 1 point. Ties favour newer posts. */
export async function getRelated(post, n = 3, posts = []) {
	const tags = new Set(post.data.tags ?? []);
	return posts
		.filter((candidate) => candidate.id !== post.id)
		.map((candidate) => ({
			post: candidate,
			score:
				(candidate.data.tags ?? []).filter((tag) => tags.has(tag)).length * 2 +
				(candidate.data.category === post.data.category ? 1 : 0),
		}))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score || newestFirst(a.post, b.post))
		.slice(0, Math.max(0, Math.floor(n)))
		.map(({ post: item }) => item);
}

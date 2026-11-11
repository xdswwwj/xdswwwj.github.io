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

/** Newest months first, using UTC so build machine timezone does not change groups. */
export function groupByMonth(posts) {
	const groups = new Map();
	for (const post of [...posts].sort(newestFirst)) {
		const year = post.data.pubDate.getUTCFullYear();
		const month = post.data.pubDate.getUTCMonth() + 1;
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

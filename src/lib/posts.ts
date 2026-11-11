import { getCollection, type CollectionEntry } from 'astro:content';

type Post = CollectionEntry<'blog'>;
export type PostMonth = { year: number; month: number; posts: Post[] };

const newestFirst = (a: Post, b: Post) =>
	b.data.pubDate.valueOf() - a.data.pubDate.valueOf();

/** Drafts are visible only in the development server. */
export async function getSortedPosts(): Promise<Post[]> {
	return (await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft))
		.sort(newestFirst);
}

/** Korean reading estimate, excluding whitespace, at about 500 characters/minute. */
export function readingTime(body: string = ''): string {
	const minutes = Math.max(1, Math.round(body.replace(/\s/g, '').length / 500));
	return `약 ${minutes}분`;
}

/** Previous means older; next means newer. Missing neighbours are null. */
export async function getPrevNext(id: string, posts?: Post[]) {
	const sorted = posts ? [...posts].sort(newestFirst) : await getSortedPosts();
	const index = sorted.findIndex((post) => post.id === id);
	return {
		prev: index < 0 ? null : sorted[index + 1] ?? null,
		next: index < 0 ? null : sorted[index - 1] ?? null,
	};
}

/** Newest months first, using UTC so build machine timezone does not change groups. */
export function groupByMonth(posts: Post[]): PostMonth[] {
	const groups = new Map<string, PostMonth>();
	for (const post of [...posts].sort(newestFirst)) {
		const year = post.data.pubDate.getUTCFullYear();
		const month = post.data.pubDate.getUTCMonth() + 1;
		const key = `${year}-${month}`;
		if (!groups.has(key)) groups.set(key, { year, month, posts: [] });
		groups.get(key)!.posts.push(post);
	}
	return [...groups.values()];
}

/** Shared tags: 2 points each; same category: 1 point. Ties favour newer posts. */
export async function getRelated(post: Post, n = 3, posts?: Post[]): Promise<Post[]> {
	const candidates = posts ?? await getSortedPosts();
	const tags = new Set(post.data.tags);
	return candidates
		.filter((candidate) => candidate.id !== post.id)
		.map((candidate) => ({
			post: candidate,
			score: candidate.data.tags.filter((tag) => tags.has(tag)).length * 2
				+ (candidate.data.category === post.data.category ? 1 : 0),
		}))
		.filter(({ score }) => score > 0)
		.sort((a, b) => b.score - a.score || newestFirst(a.post, b.post))
		.slice(0, Math.max(0, Math.floor(n)))
		.map(({ post }) => post);
}

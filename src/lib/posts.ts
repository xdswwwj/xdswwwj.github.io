import { getCollection, type CollectionEntry } from 'astro:content';
import {
	newestFirst,
	readingTime as calcReadingTime,
	getPrevNext as calcPrevNext,
	groupByMonth as calcGroupByMonth,
	getRelated as calcRelated,
} from './posts-pure.mjs';

type Post = CollectionEntry<'blog'>;
export type PostMonth = { year: number; month: number; posts: Post[] };

/** Drafts are visible only in the development server. */
export async function getSortedPosts(): Promise<Post[]> {
	return (await getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft))
		.sort(newestFirst);
}

/** Korean reading estimate, excluding whitespace, at about 500 characters/minute. */
export function readingTime(body: string = ''): string {
	return calcReadingTime(body);
}

/** Previous means older; next means newer. Missing neighbours are null. */
export async function getPrevNext(id: string, posts?: Post[]) {
	return calcPrevNext(id, posts ?? await getSortedPosts());
}

/** Newest months first, using UTC so build machine timezone does not change groups. */
export function groupByMonth(posts: Post[]): PostMonth[] {
	return calcGroupByMonth(posts);
}

/** Shared tags: 2 points each; same category: 1 point. Ties favour newer posts. */
export async function getRelated(post: Post, n = 3, posts?: Post[]): Promise<Post[]> {
	return calcRelated(post, n, posts ?? await getSortedPosts());
}

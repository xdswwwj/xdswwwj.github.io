import { type CollectionEntry, getCollection } from 'astro:content';

/**
 * 공개할 글만 돌려준다. 글 목록이 필요한 곳은 getCollection('blog') 대신 이 함수를 쓴다.
 * - 운영 빌드: draft: true 인 글은 뺀다 (페이지가 안 만들어지므로 sitemap 에서도 빠진다).
 * - 개발 서버(import.meta.env.DEV): 초안도 보여 준다 (발행 전 확인용).
 */
export async function getPublishedPosts(): Promise<CollectionEntry<'blog'>[]> {
	return getCollection('blog', ({ data }) => import.meta.env.DEV || !data.draft);
}

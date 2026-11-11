export interface PostLike {
	id: string;
	data: {
		pubDate: Date;
		category: string;
		tags?: string[];
	};
}

export type PostMonthLike<T extends PostLike = PostLike> = {
	year: number;
	month: number;
	posts: T[];
};

export function newestFirst<T extends PostLike>(a: T, b: T): number;
export function readingTime(body?: string): string;
export function getPrevNext<T extends PostLike>(
	id: string,
	posts?: T[],
): Promise<{ prev: T | null; next: T | null }>;
export function groupByMonth<T extends PostLike>(posts: T[]): PostMonthLike<T>[];
export function getRelated<T extends PostLike>(
	post: T,
	n?: number,
	posts?: T[],
): Promise<T[]>;

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			slug: z.string().optional(),
			description: z.string(),
			pubDate: z.coerce.date(),
			// true 면 운영 빌드에서 빠진다 (src/utils/posts.ts). 개발 서버에서는 보인다.
			draft: z.boolean().optional().default(false),
			updatedDate: z.coerce.date().optional(),
			heroImage: z.optional(image()),
			category: z.string(),
			tags: z.array(z.string()).optional().default([]),
		}),
});

export const collections = { blog };

import { readFile } from 'node:fs/promises';
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import satori from 'satori';
import sharp from 'sharp';
import { SITE_TITLE } from '../../consts';

const fontDir = 'node_modules/pretendard/dist/public/static/alternative';
const [fontBold, fontRegular] = await Promise.all([
	readFile(`${fontDir}/Pretendard-Bold.ttf`),
	readFile(`${fontDir}/Pretendard-Regular.ttf`),
]);

export async function getStaticPaths() {
	const posts = await getCollection('blog');
	return posts.map((post) => ({
		params: { slug: post.id },
		props: {
			title: post.data.title,
			category: post.data.category,
		},
	}));
}

type Props = { title: string; category: string };

export const GET: APIRoute = async ({ props }) => {
	const { title, category } = props as Props;

	const markup = {
		type: 'div',
		props: {
			style: {
				width: '100%',
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				justifyContent: 'space-between',
				padding: '72px 80px',
				background:
					'linear-gradient(135deg, #0a0c12 0%, #11141d 60%, #161a24 100%)',
				color: '#e8edf4',
				fontFamily: 'Pretendard',
			},
			children: [
				{
					type: 'div',
					props: {
						style: { display: 'flex', alignItems: 'center', gap: '16px' },
						children: [
							{
								type: 'div',
								props: {
									style: {
										width: '20px',
										height: '20px',
										borderRadius: '6px',
										background:
											'linear-gradient(135deg, #1ed760 0%, #4ce98a 100%)',
									},
								},
							},
							{
								type: 'div',
								props: {
									style: { fontSize: '30px', color: '#8b94a6' },
									children: SITE_TITLE,
								},
							},
						],
					},
				},
				{
					type: 'div',
					props: {
						style: { display: 'flex', flexDirection: 'column', gap: '28px' },
						children: [
							{
								type: 'div',
								props: {
									style: {
										display: 'flex',
										fontSize: '30px',
										fontWeight: 700,
										color: '#1ed760',
									},
									children: `# ${category}`,
								},
							},
							{
								type: 'div',
								props: {
									style: {
										display: 'flex',
										fontSize: '68px',
										fontWeight: 700,
										lineHeight: 1.25,
										letterSpacing: '-0.02em',
										color: '#ffffff',
									},
									children: title,
								},
							},
						],
					},
				},
				{
					type: 'div',
					props: {
						style: {
							display: 'flex',
							alignItems: 'center',
							gap: '12px',
							fontSize: '26px',
							color: '#8b94a6',
						},
						children: 'xdswwwj.github.io',
					},
				},
			],
		},
	};

	const svg = await satori(markup as Parameters<typeof satori>[0], {
		width: 1200,
		height: 630,
		fonts: [
			{ name: 'Pretendard', data: fontRegular, weight: 400, style: 'normal' },
			{ name: 'Pretendard', data: fontBold, weight: 700, style: 'normal' },
		],
	});

	const png = await sharp(Buffer.from(svg)).png().toBuffer();

	return new Response(png, {
		headers: {
			'Content-Type': 'image/png',
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	});
};

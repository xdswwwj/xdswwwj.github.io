import { visit } from 'unist-util-visit';

// 마크다운의 ```mermaid 코드블록을 <pre class="mermaid">로 바꿔
// 클라이언트의 mermaid 라이브러리가 그림으로 렌더링하도록 한다.
export function remarkMermaid() {
	return (tree) => {
		visit(tree, 'code', (node, index, parent) => {
			if (node.lang !== 'mermaid' || !parent || index === null) return;
			const escaped = String(node.value)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			parent.children[index] = {
				type: 'html',
				value: `<pre class="mermaid">${escaped}</pre>`,
			};
		});
	};
}

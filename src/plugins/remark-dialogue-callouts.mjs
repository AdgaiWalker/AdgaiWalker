const markerPattern = /^\[!(human|ai)\]\s*(.*)$/i;

function getTextNode(paragraph) {
  return paragraph?.type === 'paragraph'
    ? paragraph.children?.find((child) => child.type === 'text')
    : undefined;
}

function visit(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);

  if (!Array.isArray(node.children)) return;
  for (const child of node.children) {
    visit(child, visitor);
  }
}

export default function remarkDialogueCallouts() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.type !== 'blockquote') return;

      const firstChild = node.children?.[0];
      const textNode = getTextNode(firstChild);
      const match = textNode?.value?.match(markerPattern);
      if (!match) return;

      const role = match[1].toLowerCase();
      const speaker = match[2]?.trim() || (role === 'human' ? 'Walker' : 'AI');

      textNode.value = textNode.value.replace(markerPattern, '').trimStart();

      if (firstChild.type === 'paragraph') {
        firstChild.children = firstChild.children.filter((child) =>
          child.type !== 'text' || child.value.trim().length > 0
        );
      }

      node.children = node.children.filter((child) =>
        child.type !== 'paragraph' || child.children.length > 0
      );

      node.data = {
        ...node.data,
        hName: 'div',
        hProperties: {
          className: ['dialogue-callout', `dialogue-callout-${role}`],
          'data-speaker': speaker,
        },
      };
    });
  };
}

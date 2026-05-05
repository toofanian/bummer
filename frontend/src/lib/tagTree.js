export function buildTagTree(flatTags) {
  const byId = new Map();
  for (const t of flatTags) byId.set(t.id, { ...t, children: [] });
  const roots = [];
  for (const node of byId.values()) {
    if (node.parent_tag_id && byId.has(node.parent_tag_id)) {
      byId.get(node.parent_tag_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes) => {
    nodes.sort((a, b) => a.position - b.position);
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export function findNode(tree, tagId) {
  for (const node of tree) {
    if (node.id === tagId) return node;
    const sub = findNode(node.children, tagId);
    if (sub) return sub;
  }
  return null;
}

export function getDescendantIds(tree, tagId) {
  const result = new Set();
  const node = findNode(tree, tagId);
  if (!node) return result;
  const walk = (n) => {
    result.add(n.id);
    n.children.forEach(walk);
  };
  walk(node);
  return result;
}

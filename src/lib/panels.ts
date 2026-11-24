import type { ThreadItem } from './thread';

export interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  children: TreeNode[];
}

/** Turns a flat list of paths into folders first, then files, each sorted by name. */
export function buildFileTree(paths: readonly string[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', dir: true, children: [] };
  for (const p of paths) {
    const parts = p.split('/');
    let node = root;
    parts.forEach((part, i) => {
      const isDir = i < parts.length - 1;
      let child = node.children.find((c) => c.name === part && c.dir === isDir);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join('/'), dir: isDir, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
    n.children.forEach(sort);
  };
  sort(root);
  return root.children;
}

export interface OutlineEntry {
  index: number;
  label: string;
  level: 0 | 1;
}

/** The thread's turns (each user message) and the headings in replies. */
export function buildOutline(items: readonly ThreadItem[]): OutlineEntry[] {
  const out: OutlineEntry[] = [];
  items.forEach((item, index) => {
    if (item.kind === 'user') {
      const first = item.text.split('\n').find((l) => l.trim() && !l.startsWith('>')) ?? item.text;
      out.push({ index, label: first.trim().slice(0, 120), level: 0 });
    } else if (item.kind === 'text') {
      for (const m of item.text.matchAll(/^#{1,3}\s+(.+)$/gm)) {
        out.push({ index, label: m[1]!.replace(/[*_`]/g, '').trim(), level: 1 });
      }
    }
  });
  return out;
}

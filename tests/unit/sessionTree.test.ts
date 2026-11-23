import { describe, expect, it } from 'vitest';
import { buildSessionTree, flattenTree, type SessionNodeInput } from '../../shared/sessionTree';

const s = (
  id: string,
  agent: 'claude' | 'codex',
  updatedAt: number,
  parentId: string | null = null,
): SessionNodeInput => ({ id, agent, updatedAt, parentId, title: id });

describe('agent icon rule', () => {
  it('shows no dot when every descendant uses the same agent', () => {
    const [root] = buildSessionTree([s('a', 'claude', 1), s('b', 'claude', 2, 'a')]);
    expect(root!.dotAgent).toBeNull();
  });

  it('shows the other agent dot for a direct child on the other agent', () => {
    const [root] = buildSessionTree([s('a', 'claude', 1), s('b', 'codex', 2, 'a')]);
    expect(root!.dotAgent).toBe('codex');
    expect(root!.children[0]!.dotAgent).toBeNull();
  });

  it('looks through grandchildren', () => {
    const [root] = buildSessionTree([
      s('a', 'codex', 1),
      s('b', 'codex', 2, 'a'),
      s('c', 'claude', 3, 'b'),
    ]);
    expect(root!.dotAgent).toBe('claude');
    expect(root!.children[0]!.dotAgent).toBe('claude');
  });
});

describe('buildSessionTree', () => {
  it('sorts roots newest first and children in start order', () => {
    const roots = buildSessionTree([
      s('old', 'claude', 1),
      s('new', 'claude', 5),
      s('c2', 'codex', 4, 'old'),
      s('c1', 'codex', 3, 'old'),
    ]);
    expect(roots.map((r) => r.session.id)).toEqual(['new', 'old']);
    expect(roots[1]!.children.map((c) => c.session.id)).toEqual(['c1', 'c2']);
    expect(roots[1]!.children[0]!.depth).toBe(1);
  });

  it('treats a session whose parent is missing as a root', () => {
    const roots = buildSessionTree([s('orphan', 'codex', 1, 'gone')]);
    expect(roots).toHaveLength(1);
  });

  it('flattens and skips collapsed children', () => {
    const roots = buildSessionTree([
      s('a', 'claude', 2),
      s('b', 'codex', 3, 'a'),
      s('z', 'claude', 1),
    ]);
    expect(flattenTree(roots).map((n) => n.session.id)).toEqual(['a', 'b', 'z']);
    expect(flattenTree(roots, new Set(['a'])).map((n) => n.session.id)).toEqual(['a', 'z']);
  });
});

import type { AgentId } from './agents';

/** The fields the sidebar needs to draw one session row. */
export interface SessionNodeInput {
  id: string;
  parentId: string | null;
  agent: AgentId;
  title: string;
  updatedAt: number;
  /** Live state for the row icon: spinner while running, amber dot while an approval waits. */
  status?: 'idle' | 'running' | 'waiting' | 'error';
}

export interface SessionNode<T extends SessionNodeInput = SessionNodeInput> {
  session: T;
  depth: number;
  children: SessionNode<T>[];
  /** The other agent's color dot: set when any descendant runs on a different agent. */
  dotAgent: AgentId | null;
}

/**
 * Agent icon rule (docs/PLAN.md): a row shows its own agent's icon; if any descendant
 * sub-session runs on the other agent, a dot in that agent's color sits on the icon.
 */
export function otherAgentInDescendants<T extends SessionNodeInput>(
  node: SessionNode<T>,
): AgentId | null {
  const own = node.session.agent;
  const stack = [...node.children];
  while (stack.length > 0) {
    const child = stack.pop()!;
    if (child.session.agent !== own) return child.session.agent;
    stack.push(...child.children);
  }
  return null;
}

/**
 * Builds the sidebar tree: roots newest first, sub-sessions under their parent (oldest
 * first, in the order they were started). Orphans whose parent is missing become roots.
 */
export function buildSessionTree<T extends SessionNodeInput>(
  sessions: readonly T[],
): SessionNode<T>[] {
  const nodes = new Map<string, SessionNode<T>>();
  for (const s of sessions) nodes.set(s.id, { session: s, depth: 0, children: [], dotAgent: null });

  const roots: SessionNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.session.parentId ? nodes.get(node.session.parentId) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }

  const finish = (list: SessionNode<T>[], depth: number, newestFirst: boolean) => {
    list.sort((a, b) =>
      newestFirst
        ? b.session.updatedAt - a.session.updatedAt
        : a.session.updatedAt - b.session.updatedAt,
    );
    for (const node of list) {
      node.depth = depth;
      finish(node.children, depth + 1, false);
      node.dotAgent = otherAgentInDescendants(node);
    }
  };
  finish(roots, 0, true);
  return roots;
}

/** Depth-first list of visible rows, skipping children of collapsed parents. */
export function flattenTree<T extends SessionNodeInput>(
  roots: readonly SessionNode<T>[],
  collapsed: ReadonlySet<string> = new Set(),
): SessionNode<T>[] {
  const out: SessionNode<T>[] = [];
  const walk = (list: readonly SessionNode<T>[]) => {
    for (const node of list) {
      out.push(node);
      if (!collapsed.has(node.session.id)) walk(node.children);
    }
  };
  walk(roots);
  return out;
}

import type { AgentId } from '../../shared/agents';
import type { SessionNodeInput } from '../../shared/sessionTree';

/** Fixture data for M1, copied from the design canvas (artboard 1). Replaced by real data in M2. */
export interface FixtureFolder {
  id: string;
  name: string;
  sessions: SessionNodeInput[];
}

let t = 1_000;
const s = (
  id: string,
  agent: AgentId,
  title: string,
  parentId: string | null = null,
): SessionNodeInput => ({
  id,
  agent,
  title,
  parentId,
  updatedAt: (t -= 1),
});

export const fixtureFolders: FixtureFolder[] = [
  { id: 'f1', name: 'house design', sessions: [] },
  { id: 'f2', name: 'macbook_debug', sessions: [] },
  {
    id: 'f3',
    name: 'session_test',
    sessions: [
      s('s1', 'claude', 'Review thư mục với Codex'),
      s('s1a', 'codex', 'Codex review of session_test folder', 's1'),
      s('s2', 'claude', 'Tạo nested session với Codex'),
      s('s3', 'claude', 'Research ai với nested session'),
      s('s3a', 'codex', 'Research về AI', 's3'),
      s('s4', 'claude', 'Nested session về AI'),
      s('s5', 'claude', 'Folder analysis'),
      s('s6', 'claude', '10-line poem in markdown'),
    ],
  },
];

export interface FixtureUsage {
  claude: { label: string; percent: number; resets: string };
  codex: { percent: number; resets: string };
}

export const fixtureUsage: FixtureUsage = {
  claude: { label: 'Weekly · all models', percent: 57, resets: '3d' },
  codex: { percent: 10, resets: '27d' },
};

export const fixtureAccounts: { agent: AgentId; initial: string; plan: string }[] = [
  { agent: 'claude', initial: 'M', plan: 'Ultra' },
  { agent: 'codex', initial: 'M', plan: 'ChatGPT Go' },
];

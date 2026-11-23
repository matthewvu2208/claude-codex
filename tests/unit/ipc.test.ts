import { describe, expect, it } from 'vitest';
import { ipcContract } from '../../shared/ipc';
import { titleFromPrompt } from '../../shared/models';

describe('ipc contract', () => {
  const create = ipcContract['sessions:create'].input;
  const valid = {
    folderId: 'f1',
    agent: 'claude',
    prompt: 'Fix it',
    model: null,
    effort: null,
    permission: 'ask',
    worktree: false,
  };

  it('accepts a valid create payload', () => {
    expect(create.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['unknown agent', { ...valid, agent: 'gpt' }],
    ['empty prompt', { ...valid, prompt: '' }],
    ['bad permission', { ...valid, permission: 'root' }],
    ['missing folder', { ...valid, folderId: undefined }],
    ['not an object', 'drop table'],
  ])('rejects %s', (_name, payload) => {
    expect(create.safeParse(payload).success).toBe(false);
  });

  it('trims and requires rename titles', () => {
    const rename = ipcContract['sessions:rename'].input;
    expect(rename.parse({ id: 'a', title: '  New  ' }).title).toBe('New');
    expect(rename.safeParse({ id: 'a', title: '   ' }).success).toBe(false);
  });

  it('only accepts known settings keys', () => {
    const set = ipcContract['settings:set'].input;
    expect(set.safeParse({ lastAgent: 'codex' }).success).toBe(true);
    expect(set.safeParse({ lastAgent: 'nope' }).success).toBe(false);
  });

  it('accepts no input for list channels', () => {
    expect(ipcContract['sessions:list'].input.safeParse(undefined).success).toBe(true);
    expect(ipcContract['sessions:list'].input.safeParse({ evil: 1 }).success).toBe(false);
  });
});

describe('titleFromPrompt', () => {
  it('keeps the first non-empty line as typed', () => {
    expect(titleFromPrompt('\n  Sửa lỗi build  \nmore')).toBe('Sửa lỗi build');
    expect(titleFromPrompt('x'.repeat(300))).toHaveLength(200);
  });
});

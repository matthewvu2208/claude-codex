import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Logger, redact } from '../../electron/main/services/log';

describe('log file', () => {
  it('redacts anything shaped like a key or token', () => {
    const line = redact(
      [
        'key sk-ant-api03-abcdefghijklmnop',
        'openai sk-proj-abcdefghijklmnopqrstu',
        'Authorization: Bearer abc.def.ghijklmnop',
        '{"access_token":"secret-value","refreshToken":"r-123456"}',
        'apiKey=hunter2hunter2',
        'jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4',
      ].join(' | '),
    );
    for (const secret of [
      'abcdefghijklmnop',
      'abcdefghijklmnopqrstu',
      'abc.def.ghijklmnop',
      'secret-value',
      'r-123456',
      'hunter2hunter2',
      'SflKxwRJSMeKKF2QT4',
    ])
      expect(line).not.toContain(secret);
    expect(redact('Codex app-server exited')).toBe('Codex app-server exited');
  });

  it('appends lines with level and error stacks, and rotates at the size limit', () => {
    const dir = mkdtempSync(join(tmpdir(), 'log-'));
    const logger = new Logger(dir, 200);
    logger.info('App start', { version: '1.0.0' });
    logger.error('Boom', new Error('broken'));
    const text = readFileSync(join(dir, 'main.log'), 'utf8');
    expect(text).toMatch(/INFO App start \{"version":"1.0.0"\}/);
    expect(text).toMatch(/ERROR Boom Error: broken/);

    for (let i = 0; i < 5; i++) logger.info(`line ${i} `.repeat(10));
    expect(existsSync(join(dir, 'main.1.log'))).toBe(true);
    expect(readFileSync(join(dir, 'main.log'), 'utf8').length).toBeLessThan(400);
  });
});

import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, isAllowedNavigation } from '../../shared/security';

describe('contentSecurityPolicy', () => {
  it('is strict in production', () => {
    const csp = contentSecurityPolicy(false);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('localhost');
  });

  it('only relaxes scripts and connections for the dev server', () => {
    const csp = contentSecurityPolicy(true);
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain('ws://localhost:*');
    expect(csp).not.toContain('unsafe-eval');
  });
});

describe('isAllowedNavigation', () => {
  const file = 'file:///Applications/App.app/Contents/Resources/app.asar/out/renderer/index.html';

  it('allows reloading the app page', () => {
    expect(isAllowedNavigation(file, file)).toBe(true);
    expect(isAllowedNavigation(`${file}#outline`, file)).toBe(true);
  });

  it('blocks other local files', () => {
    expect(isAllowedNavigation('file:///etc/passwd', file)).toBe(false);
  });

  it('blocks remote content', () => {
    expect(isAllowedNavigation('https://example.com', file)).toBe(false);
    expect(isAllowedNavigation('https://example.com', 'http://localhost:5173/')).toBe(false);
  });

  it('allows the dev server origin only', () => {
    expect(isAllowedNavigation('http://localhost:5173/x', 'http://localhost:5173/')).toBe(true);
    expect(isAllowedNavigation('http://localhost:5174/', 'http://localhost:5173/')).toBe(false);
  });

  it('rejects malformed URLs', () => {
    expect(isAllowedNavigation('not a url', file)).toBe(false);
  });
});

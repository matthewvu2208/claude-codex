/** Content Security Policy for the main window. */
export function contentSecurityPolicy(dev: boolean): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // The dev server injects the React Refresh preamble as an inline module script.
    'script-src': dev ? ["'self'", "'unsafe-inline'"] : ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:'],
    'font-src': ["'self'"],
    'connect-src': dev ? ["'self'", 'ws://localhost:*', 'http://localhost:*'] : ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'none'"],
    'frame-src': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

/**
 * The main window may only show the app itself. Any navigation away from the
 * page it was loaded with is blocked.
 */
export function isAllowedNavigation(target: string, appUrl: string): boolean {
  let to: URL;
  let app: URL;
  try {
    to = new URL(target);
    app = new URL(appUrl);
  } catch {
    return false;
  }
  if (app.protocol === 'file:') {
    return to.protocol === 'file:' && to.pathname === app.pathname;
  }
  return to.origin === app.origin;
}

import { ArrowLeft, ArrowRight, Globe, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { api } from '../../lib/ipc';

const BrowserState = z.object({
  url: z.string(),
  title: z.string(),
  canGoBack: z.boolean(),
  canGoForward: z.boolean(),
  loading: z.boolean(),
});
type State = z.infer<typeof BrowserState>;

/** Last address per app run, so reopening the panel shows the same page. */
let lastUrl: string | null = null;

/**
 * A page preview (e.g. a local dev server). The page itself is a sandboxed native view that main
 * places over this panel's area; it has no access to the app.
 */
export function BrowserPanel() {
  const area = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State | null>(null);
  const [address, setAddress] = useState(lastUrl ?? '');
  const [servers, setServers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const placeRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    const off = api.browser.onState((raw) => {
      const s = BrowserState.safeParse(raw);
      if (!s.success) return;
      setState(s.data);
      if (s.data.url) {
        lastUrl = s.data.url;
        setAddress(s.data.url);
      }
    });
    void api.browser.devServers().then(setServers);
    return off;
  }, []);

  // Keep the native view on top of this area while the panel is open.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    // Reopening the panel restores the last page once; later placements only move the view.
    let restoreUrl = lastUrl;
    const place = () => {
      // Nothing to show until there is an address; the empty state stays visible.
      if (!lastUrl) return void api.browser.hide();
      const r = el.getBoundingClientRect();
      void api.browser.show({
        bounds: { x: r.left, y: r.top, width: r.width, height: r.height },
        ...(restoreUrl ? { url: restoreUrl } : {}),
      });
      restoreUrl = null;
    };
    placeRef.current = place;
    const ro = new ResizeObserver(place);
    ro.observe(el);
    window.addEventListener('resize', place);
    place();
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      void api.browser.hide();
    };
    // Placement only depends on the element; the URL is restored once on open.
  }, []);

  const go = async (url: string) => {
    const r = await api.browser.navigate({ url });
    setError(r ? null : 'Enter a web address, like localhost:5173');
    if (r) {
      lastUrl = r;
      setAddress(r);
      placeRef.current();
    }
  };

  const button =
    'flex size-7 flex-none items-center justify-center rounded-md text-secondary hover:bg-raised disabled:text-disabled disabled:hover:bg-transparent';
  const hasPage = !!state?.url || !!lastUrl;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void go(address);
        }}
      >
        <button
          type="button"
          aria-label="Back"
          disabled={!state?.canGoBack}
          onClick={() => void api.browser.action({ action: 'back' })}
          className={button}
        >
          <ArrowLeft size={15} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Forward"
          disabled={!state?.canGoForward}
          onClick={() => void api.browser.action({ action: 'forward' })}
          className={button}
        >
          <ArrowRight size={15} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Reload"
          disabled={!hasPage}
          onClick={() => void api.browser.action({ action: 'reload' })}
          className={button}
        >
          <RotateCw size={14} className={state?.loading ? 'animate-spin' : ''} aria-hidden />
        </button>
        <input
          aria-label="Address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="localhost:5173"
          spellCheck={false}
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-input px-2 font-mono text-[12px] outline-none focus:border-border-strong"
        />
      </form>
      {error ? (
        <p role="alert" className="m-0 px-3 pt-1.5 text-[12px] text-danger">
          {error}
        </p>
      ) : null}
      <div ref={area} className="relative min-h-0 flex-1" data-testid="browser-area">
        {!hasPage ? (
          <div className="flex flex-col items-start gap-2 p-4 text-[13px] text-secondary">
            <Globe size={18} aria-hidden />
            {servers.length > 0 ? (
              <>
                <span>Dev servers running on this computer:</span>
                {servers.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void go(s)}
                    className="font-mono text-[12px] text-link hover:underline"
                  >
                    {s}
                  </button>
                ))}
              </>
            ) : (
              <span>Enter an address to preview a page, such as your local dev server.</span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

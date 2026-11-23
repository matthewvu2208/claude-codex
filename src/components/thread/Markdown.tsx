import { Check, Copy } from 'lucide-react';
import { memo, useEffect, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { highlight } from '../../lib/highlight';

function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    if (lang) void highlight(code, lang).then((h) => live && setHtml(h));
    return () => {
      live = false;
    };
  }, [code, lang]);

  const copy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <div className="group relative my-1 rounded-[10px] border border-border bg-sidebar">
      <div className="flex h-8 items-center justify-between border-b border-border-subtle px-3 font-mono text-[12px] text-muted">
        <span>{lang || 'text'}</span>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? 'Copied' : 'Copy code'}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-muted hover:bg-raised hover:text-primary"
        >
          {copied ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
          <span className="font-sans">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {html ? (
        <div
          className="overflow-x-auto px-3.5 py-3 font-mono text-[13px] leading-[1.6] [&_pre]:m-0 [&_pre]:bg-transparent!"
          // Shiki builds this HTML from the code text and escapes it.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="m-0 overflow-x-auto px-3.5 py-3 font-mono text-[13px] leading-[1.6]">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
}

const components: Components = {
  p: ({ children }) => <p className="m-0">{children}</p>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-link underline-offset-2 hover:underline"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="m-0 flex list-disc flex-col gap-1.5 pl-[22px]">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="m-0 flex list-decimal flex-col gap-2.5 pl-[22px]">{children}</ol>
  ),
  h1: ({ children }) => <h3 className="m-0 text-[19px] font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="m-0 text-[18px] font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="m-0 text-[17px] font-semibold">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="m-0 border-l-[3px] border-border pl-3 text-secondary">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[14px] [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
        {children}
      </table>
    </div>
  ),
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const text = String(children ?? '');
    const lang = /language-([\w+#-]+)/.exec(className ?? '')?.[1];
    if (lang || text.includes('\n'))
      return <CodeBlock code={text.replace(/\n$/, '')} lang={lang ?? ''} />;
    return (
      <code className="rounded-[5px] bg-raised px-1.5 py-0.5 font-mono text-[13.5px]">
        {children as ReactNode}
      </code>
    );
  },
};

/** Assistant reply text: markdown with GFM, highlighted code blocks with Copy. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-3 text-[16.5px] leading-[1.7] break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});

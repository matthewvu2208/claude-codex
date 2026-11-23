import { createCssVariablesTheme, createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages, bundledLanguagesAlias } from 'shiki/langs';

/** Colors come from the --shiki-* tokens in tokens.css. */
const theme = createCssVariablesTheme({
  name: 'tokens',
  variablePrefix: '--shiki-',
  fontStyle: true,
});

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  // The JavaScript regex engine avoids WebAssembly, so the CSP needs no wasm exception.
  highlighter ??= createHighlighterCore({
    themes: [theme],
    langs: [],
    engine: createJavaScriptRegexEngine(),
  });
  return highlighter;
}

const known = (lang: string): keyof typeof bundledLanguages | null => {
  if (lang in bundledLanguages) return lang as keyof typeof bundledLanguages;
  const alias = (bundledLanguagesAlias as unknown as Record<string, string>)[lang];
  return alias && alias in bundledLanguages ? (alias as keyof typeof bundledLanguages) : null;
};

/** Highlighted HTML for a code block, or null when the language is unknown. Shiki escapes the code. */
export async function highlight(code: string, lang: string): Promise<string | null> {
  const id = known(lang.toLowerCase());
  if (!id) return null;
  const h = await getHighlighter();
  if (!h.getLoadedLanguages().includes(id)) await h.loadLanguage(bundledLanguages[id]);
  return h.codeToHtml(code, { lang: id, theme: 'tokens' });
}

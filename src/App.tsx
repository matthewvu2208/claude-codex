import { Layers } from 'lucide-react';

export function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 bg-main text-primary">
      <Layers aria-hidden="true" className="size-8 text-muted" strokeWidth={1.5} />
      <h1 className="text-[15px] font-normal">Claude Codex</h1>
      <p className="text-[13px] text-secondary">Scaffold ready</p>
    </main>
  );
}

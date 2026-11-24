import { existsSync, readFileSync } from 'node:fs';

/**
 * Scripted agents (tests only): describe what arrived with a message, reading each attached
 * file from the path in the note, so tests prove both images and files reach the agent.
 */
export function describeAttachments(text: string, images: number): string | null {
  const files = [...text.matchAll(/^- (.+?): (.+)$/gm)].map((m) => ({ name: m[1]!, path: m[2]! }));
  if (images === 0 && files.length === 0) return null;
  const parts = [
    `I received ${images} image${images === 1 ? '' : 's'} and ${files.length} file${files.length === 1 ? '' : 's'}.`,
  ];
  for (const f of files) {
    const first = existsSync(f.path) ? (readFileSync(f.path, 'utf8').split('\n')[0] ?? '') : null;
    parts.push(first === null ? `${f.name} could not be read.` : `${f.name} starts with: ${first}`);
  }
  return parts.join(' ');
}

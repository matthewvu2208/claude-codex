import { randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import {
  AttachmentIdSchema,
  AttachmentSchema,
  INLINE_IMAGE_MIMES,
  MAX_ATTACHMENT_BYTES,
  formatBytes,
  kindFor,
  mimeFor,
  safeFileName,
  type Attachment,
} from '../../../shared/attachments';

export interface StoredAttachment extends Attachment {
  /** Absolute path of the app's copy. */
  path: string;
}

/**
 * Attachment copies live in `<root>/<id>/<name>` with `meta.json` beside them. Ids are
 * UUIDs, so a renderer can only name attachments it was given.
 */
export class AttachmentStore {
  constructor(readonly root: string) {}

  private save(name: string, write: (dest: string) => void, size: number): Attachment {
    if (size > MAX_ATTACHMENT_BYTES)
      throw new Error(
        `${name} is ${formatBytes(size)}; files can be at most ${formatBytes(MAX_ATTACHMENT_BYTES)}`,
      );
    const id = randomUUID();
    const dir = join(this.root, id);
    mkdirSync(dir, { recursive: true });
    const file = safeFileName(name);
    write(join(dir, file));
    const mime = mimeFor(file);
    const meta: Attachment = { id, name: file, mime, size, kind: kindFor(mime, size) };
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
    return meta;
  }

  /** Copies a file the person chose or dropped. */
  addPath(path: string): Attachment {
    const st = statSync(path);
    if (!st.isFile()) throw new Error(`${basename(path)} is not a file`);
    return this.save(basename(path), (dest) => copyFileSync(path, dest), st.size);
  }

  /** Stores pasted data (e.g. a screenshot from the clipboard). */
  addData(name: string, data: Uint8Array): Attachment {
    return this.save(name, (dest) => writeFileSync(dest, data), data.byteLength);
  }

  get(id: string): StoredAttachment | null {
    if (!AttachmentIdSchema.safeParse(id).success) return null;
    const dir = join(this.root, id);
    try {
      const meta = AttachmentSchema.parse(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')));
      const path = join(dir, meta.name);
      return existsSync(path) && meta.id === id ? { ...meta, path } : null;
    } catch {
      return null;
    }
  }

  /** A data URL for showing an image attachment in the conversation. */
  preview(id: string): string | null {
    const a = this.get(id);
    if (!a || a.kind !== 'image' || !INLINE_IMAGE_MIMES.has(a.mime)) return null;
    return `data:${a.mime};base64,${readFileSync(a.path).toString('base64')}`;
  }

  /** Number of stored attachments (for tests and diagnostics). */
  count(): number {
    return existsSync(this.root) ? readdirSync(this.root).length : 0;
  }
}

import { vi, type Strings } from './vi';

/** UI language. Only Vietnamese is wired up for now; en.ts is ready for later. */
export function useStrings(): Strings {
  return vi;
}

export type { Strings };

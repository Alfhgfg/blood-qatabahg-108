import type { ActivePage } from '../types';

export interface NavEntry {
  key: string;
  page: ActivePage;
  hospitalAdId?: string | null;
}

export interface NavOptions {
  key?: string;
  hospitalAdId?: string | null;
}

export interface PushNavResult {
  stack: NavEntry[];
  changed: boolean;
  current: NavEntry;
  previous?: NavEntry | null;
}

export interface PopNavResult {
  stack: NavEntry[];
  popped: NavEntry | null;
  current: NavEntry | null;
  canGoBack: boolean;
}

export function createNavEntry(page: ActivePage, options?: NavOptions): NavEntry;
export function isSameNavTarget(
  entry: NavEntry | null | undefined,
  targetPage: ActivePage,
  options?: NavOptions
): boolean;
export function pushNavEntry(
  stack: NavEntry[],
  targetPage: ActivePage,
  options?: NavOptions
): PushNavResult;
export function popNavEntry(stack: NavEntry[]): PopNavResult;
export function resetNavStack(initialPage?: ActivePage, options?: NavOptions): NavEntry[];

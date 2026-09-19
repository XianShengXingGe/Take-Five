import * as nodeModule from 'node:module';

type ClackPrompts = typeof import('@clack/prompts');

let _clack: ClackPrompts | null = null;

export async function loadClack(): Promise<ClackPrompts> {
  if (!_clack) {
    _clack = await import('@clack/prompts');
  }
  return _clack;
}

export function getClackSync(): ClackPrompts {
  if (!_clack) {
    const req = typeof require === 'function' ? require : nodeModule.createRequire(import.meta.url);
    _clack = req('@clack/prompts') as ClackPrompts;
  }
  return _clack;
}

export function isClackLoaded(): boolean {
  return _clack !== null;
}

/**
 * Pluggable abstraction for interactive terminal prompts.
 * Enables deterministic testing of CLI wizards and menus without TTY emulation.
 */
export interface PromptDriver {
  intro: (title: string) => void;
  outro: (message: string) => void;
  note: (message: string, title?: string) => void;
  cancel: (message: string) => void;
  isCancel: (value: unknown) => boolean;
  password: (opts: {
    message: string;
    validate?: (value: string) => string | undefined;
    mask?: string;
  }) => Promise<string | symbol>;
  text: (opts: {
    message: string;
    placeholder?: string;
    defaultValue?: string;
    initialValue?: string;
    validate?: (value: string) => string | undefined;
  }) => Promise<string | symbol>;
  select: <T>(opts: {
    message: string;
    options: { value: T; label: string; hint?: string }[];
    initialValue?: T;
  }) => Promise<T | symbol>;
  confirm: (opts: {
    message: string;
    initialValue?: boolean;
  }) => Promise<boolean | symbol>;
  spinner: () => {
    start: (msg?: string) => void;
    stop: (msg?: string) => void;
    message: (msg?: string) => void;
  };
}

export const defaultPromptDriver: PromptDriver = {
  intro: (title) => getClackSync().intro(title),
  outro: (message) => getClackSync().outro(message),
  note: (message, title) => getClackSync().note(message, title),
  cancel: (message) => getClackSync().cancel(message),
  isCancel: (value) => {
    if (_clack) return _clack.isCancel(value);
    return getClackSync().isCancel(value);
  },
  password: async (opts) => {
    const clack = await loadClack();
    return clack.password(opts);
  },
  text: async (opts) => {
    const clack = await loadClack();
    return clack.text(opts as Parameters<ClackPrompts['text']>[0]) as Promise<string | symbol>;
  },
  select: async <T>(opts: {
    message: string;
    options: { value: T; label: string; hint?: string }[];
    initialValue?: T;
  }): Promise<T | symbol> => {
    const clack = await loadClack();
    return clack.select(opts as Parameters<ClackPrompts['select']>[0]) as Promise<T | symbol>;
  },
  confirm: async (opts) => {
    const clack = await loadClack();
    return clack.confirm(opts);
  },
  spinner: () => {
    return getClackSync().spinner();
  },
};

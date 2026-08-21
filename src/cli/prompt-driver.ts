import * as p from '@clack/prompts';

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
  intro: p.intro,
  outro: p.outro,
  note: p.note,
  cancel: p.cancel,
  isCancel: p.isCancel,
  password: p.password,
  text: p.text as PromptDriver['text'],
  select: p.select as PromptDriver['select'],
  confirm: p.confirm,
  spinner: p.spinner,
};

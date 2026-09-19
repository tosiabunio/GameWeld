import { createElement, Fragment, type ReactNode } from 'react';

/**
 * The interface's language. English is the source: every text in the code is English, and is
 * its own key. Another language is a dictionary from those texts to its own; a text it lacks
 * shows in English, so a new screen works before it is translated. The language is the
 * viewer's, kept in this browser, and defaults to the browser's own. Changing it reloads the
 * page, which keeps `t` a plain function that any code can call.
 */
export const LANGUAGES = { en: 'English', pl: 'Polski' } as const;
export type Lang = keyof typeof LANGUAGES;

const KEY = 'gameweld:lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'pl') return saved;
  } catch {
    // Storage may be missing or refuse; the browser's language still applies.
  }
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export const lang: Lang = initial();
document.documentElement.lang = lang;

export function setLang(next: Lang) {
  try {
    localStorage.setItem(KEY, next);
  } catch {
    // Nothing to keep it in: the choice cannot outlive the reload, so it is not made.
    return;
  }
  window.location.reload();
}

let dictionary: Record<string, string> = {};
let nouns: Record<string, PluralForms> = {};

/**
 * Loads the viewer's language, which is a chunk of its own so that nobody downloads a
 * dictionary they do not read. The application starts after this (see main.tsx): texts are
 * looked up wherever code runs, some of it while modules load.
 */
export async function loadLanguage(): Promise<void> {
  if (lang !== 'pl') return;
  try {
    const pl = await import('./pl/index.ts');
    dictionary = pl.texts;
    nouns = pl.plurals;
  } catch {
    // Without its dictionary the interface shows in English rather than not at all.
  }
}

const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (whole, name: string) => String(vars[name] ?? whole)) : text;

/**
 * A text in the viewer's language. `{name}` in it is replaced from `vars`. One English word can
 * be two in another language ("Archive" the button, "Archive" the heading): `context` names the
 * use, and a dictionary may then carry "Archive [heading]" beside "Archive".
 */
export function t(text: string, vars?: Record<string, string | number>, context?: string): string {
  const own = context ? dictionary[`${text} [${context}]`] : undefined;
  return fill(own ?? dictionary[text] ?? text, vars);
}

/**
 * A text with elements inside it. The parts to wrap are numbered in the text,
 * "Next: <1>{title}</1>. See the <2>Backlog</2>.", and `wrap[n]` makes the element from what
 * stands between the tags, so a translation can put them where its own grammar wants them.
 */
export function tj(
  text: string,
  vars: Record<string, string | number> | undefined,
  wrap: Record<number, (inner: string) => ReactNode>,
): ReactNode {
  const parts = t(text, vars).split(/<(\d+)>(.*?)<\/\1>/s);
  // split() with two groups yields: text, number, inner, text, number, inner, …
  const nodes: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 3) {
    if (parts[i]) nodes.push(parts[i]);
    const n = parts[i + 1];
    if (n !== undefined) nodes.push(wrap[Number(n)]?.(parts[i + 2] ?? '') ?? parts[i + 2]);
  }
  return createElement(Fragment, null, ...nodes);
}

/** English has two forms of a noun, Polish three: one, a few (2–4, 22–24, …), and many. */
export type PluralForms = readonly [one: string, few: string, many: string];

const enPlural = (n: number, noun: string) =>
  n === 1
    ? noun
    : /(?:s|x|ch|sh)$/.test(noun)
      ? `${noun}es`
      : /[^aeiou]y$/.test(noun)
        ? `${noun.slice(0, -1)}ies`
        : `${noun}s`;

/**
 * The form of a noun that goes with a count: `${n} ${tp(n, 'task')}`. The English noun is the
 * key; its English plural is regular unless `plural` gives it.
 */
export function tp(n: number, noun: string, plural?: string): string {
  if (lang === 'pl') {
    const forms = nouns[noun];
    if (forms) {
      if (n === 1) return forms[0];
      const tens = n % 100;
      return n % 10 >= 2 && n % 10 <= 4 && !(tens >= 12 && tens <= 14) ? forms[1] : forms[2];
    }
  }
  return n === 1 ? noun : (plural ?? enPlural(n, noun));
}

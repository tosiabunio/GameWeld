import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Logo } from '../components/Brand.tsx';
import { lang, LANGUAGES, setLang, t, type Lang } from '../i18n/index.ts';

const RichTextMarkdown = lazy(() => import('../components/RichTextMarkdown.tsx'));

// Each language is a chunk of its own, so nobody downloads the text they do not read.
const TEXTS: Record<Lang, () => Promise<{ default: string }>> = {
  en: () => import('../../../../docs/methodology.md?raw'),
  pl: () => import('../../../../docs/methodology.pl.md?raw'),
};
const TITLES: Record<Lang, string> = { en: 'The GameWeld Method', pl: 'Metoda GameWeld' };

/**
 * The GameWeld method, the way of working the product is built around. The text is
 * docs/methodology.md, and docs/methodology.pl.md in Polish, so the repository and the
 * application say the same. It is open to anyone, signed in or not, since it is written for
 * teams deciding whether to use GameWeld. It is in the viewer's language, which the page can
 * change as the profile does.
 */
export function MethodPage() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void TEXTS[lang]().then((m) => live && setText(m.default));
    const before = document.title;
    document.title = TITLES[lang];
    return () => {
      live = false;
      document.title = before;
    };
  }, []);

  return (
    <div className="method-page">
      <header className="method-head">
        <Link to="/" className="method-brand">
          <Logo />
          GameWeld
        </Link>
        <nav className="method-langs" aria-label={t('Language')}>
          {(Object.keys(LANGUAGES) as Lang[]).map((l) =>
            l === lang ? (
              <span key={l} aria-current="true">
                {LANGUAGES[l]}
              </span>
            ) : (
              <button key={l} type="button" className="link" lang={l} onClick={() => setLang(l)}>
                {LANGUAGES[l]}
              </button>
            ),
          )}
        </nav>
      </header>
      <main className="method" lang={lang}>
        {text === null ? (
          <p className="muted">{t('Loading…')}</p>
        ) : (
          <Suspense fallback={<p className="muted">{t('Loading…')}</p>}>
            <RichTextMarkdown text={text} />
          </Suspense>
        )}
      </main>
    </div>
  );
}

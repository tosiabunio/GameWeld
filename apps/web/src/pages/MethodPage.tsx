import { lazy, Suspense, useEffect } from 'react';
import { Link } from 'react-router';
import method from '../../../../docs/methodology.md?raw';
import { Logo } from '../components/Brand.tsx';
import { t } from '../i18n/index.ts';

const RichTextMarkdown = lazy(() => import('../components/RichTextMarkdown.tsx'));

/**
 * The GameWeld method, the way of working the product is built around. The text is
 * docs/methodology.md, so the repository and the application say the same. It is open to anyone,
 * signed in or not, since it is written for teams deciding whether to use GameWeld. It is in
 * English only.
 */
export function MethodPage() {
  useEffect(() => {
    const before = document.title;
    document.title = 'The GameWeld Method';
    return () => {
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
      </header>
      <main className="method" lang="en">
        <Suspense fallback={<p className="muted">{t('Loading…')}</p>}>
          <RichTextMarkdown text={method} />
        </Suspense>
      </main>
    </div>
  );
}

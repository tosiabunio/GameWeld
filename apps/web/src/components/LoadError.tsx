import { t } from '../i18n/index.ts';

/**
 * What stands where data should be when it could not be loaded: what failed, and a way to try
 * again, so that a dropped connection does not leave "Loading…" for good.
 */
export function LoadError({
  message,
  retry,
  small = false,
}: {
  message: string;
  retry: () => void;
  small?: boolean;
}) {
  return (
    <p className={small ? 'error small' : 'error'} role="alert">
      {message}{' '}
      <button type="button" className="link" onClick={retry}>
        {t('Try again')}
      </button>
    </p>
  );
}

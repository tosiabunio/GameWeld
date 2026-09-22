import { setDisplayOption, useDisplayOptions } from '../displayOptions.ts';
import { DONE_WINDOWS, type DoneWindow } from '../doneWindow.ts';
import { t } from '../i18n/index.ts';
import { ActionMenu } from './ActionMenu.tsx';

const DONE_WINDOW_LABELS: Record<DoneWindow, string> = {
  30: 'in the last 30 days',
  90: 'in the last 90 days',
  0: 'at any time',
};

/**
 * This viewer's display options for lanes and cards, kept in this browser. A page of cards
 * without lanes leaves the lane option out; only the Backlog has a Done lane of items.
 */
export function DisplayMenu({ lanes = true, done = false }: { lanes?: boolean; done?: boolean }) {
  const options = useDisplayOptions();
  return (
    <ActionMenu
      label={t('Display options')}
      triggerClassName="quiet display-trigger"
      triggerContent={
        <>
          <svg
            viewBox="0 0 16 16"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M2 4.5h6M12 4.5h2M2 11.5h2M8 11.5h6" />
            <circle cx="10" cy="4.5" r="1.8" />
            <circle cx="6" cy="11.5" r="1.8" />
          </svg>
          <span>{t('Display')}</span>
        </>
      }
    >
      {lanes && (
        <label className="menu-check">
          <input
            type="checkbox"
            checked={options.collapseEmpty}
            onChange={(event) => setDisplayOption('collapseEmpty', event.target.checked)}
          />
          {t('Collapse empty columns')}
        </label>
      )}
      <label className="menu-check">
        <input
          type="checkbox"
          checked={options.smallCovers}
          onChange={(event) => setDisplayOption('smallCovers', event.target.checked)}
        />
        {t('Small cover images')}
      </label>
      <label className="menu-check">
        <input
          type="checkbox"
          checked={options.centered}
          onChange={(event) => setDisplayOption('centered', event.target.checked)}
        />
        {lanes ? t('Center columns') : t('Center cards')}
      </label>
      {done && (
        <label className="menu-field">
          {t('Done shows items accepted')}
          <select
            value={options.doneWindow}
            onChange={(event) =>
              setDisplayOption('doneWindow', Number(event.target.value) as DoneWindow)
            }
          >
            {DONE_WINDOWS.map((days) => (
              <option key={days} value={days}>
                {t(DONE_WINDOW_LABELS[days])}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="menu-note">{t('Only for you, in this browser.')}</p>
    </ActionMenu>
  );
}

import { setDisplayOption, useDisplayOptions } from '../displayOptions.ts';
import { ActionMenu } from './ActionMenu.tsx';

/** This viewer's display options for lanes and cards, kept in this browser. */
export function DisplayMenu() {
  const options = useDisplayOptions();
  return (
    <ActionMenu
      label="Display options"
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
          <span>Display</span>
        </>
      }
    >
      <label className="menu-check">
        <input
          type="checkbox"
          checked={options.collapseEmpty}
          onChange={(event) => setDisplayOption('collapseEmpty', event.target.checked)}
        />
        Collapse empty columns
      </label>
      <label className="menu-check">
        <input
          type="checkbox"
          checked={options.smallCovers}
          onChange={(event) => setDisplayOption('smallCovers', event.target.checked)}
        />
        Small cover images
      </label>
      <p className="menu-note">Only for you, in this browser.</p>
    </ActionMenu>
  );
}

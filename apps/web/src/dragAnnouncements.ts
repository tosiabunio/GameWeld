import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core';
import { t } from './i18n/index.ts';

/**
 * What a screen reader is told while a card is moved by keyboard. Left to itself the drag
 * library names cards and columns by their ids, in English: "Draggable item 3f2a… was moved over
 * droppable area 9c1e…". Here they go by the titles on screen, in the viewer's language.
 * `nameOf` gives the title of a card or of a lane, by the id the drag knows it by.
 */
export function dragAccessibility(nameOf: (id: string) => string | undefined): {
  announcements: Announcements;
  screenReaderInstructions: ScreenReaderInstructions;
} {
  const name = (id: UniqueIdentifier) => nameOf(String(id)) ?? t('a card');
  return {
    screenReaderInstructions: {
      draggable: t(
        'To pick up a card, press Space or Enter. Move it with the arrow keys, drop it with Space or Enter, or cancel with Escape.',
      ),
    },
    announcements: {
      onDragStart: ({ active }) => t('Picked up: {card}.', { card: name(active.id) }),
      onDragOver: ({ active, over }) =>
        over && over.id !== active.id
          ? t('{card} is now at: {place}.', { card: name(active.id), place: name(over.id) })
          : undefined,
      onDragEnd: ({ active, over }) =>
        over && over.id !== active.id
          ? t('Dropped {card} at: {place}.', { card: name(active.id), place: name(over.id) })
          : t('Dropped: {card}.', { card: name(active.id) }),
      onDragCancel: ({ active }) =>
        t('Moving cancelled. {card} is back where it was.', { card: name(active.id) }),
    },
  };
}

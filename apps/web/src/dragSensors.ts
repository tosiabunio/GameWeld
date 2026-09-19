import {
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';

/**
 * How a card is picked up. A mouse drags once it has moved a little, so that a click stays a
 * click. A finger drags after a short hold, so that a swipe over cards scrolls the page, as it
 * does everywhere else on a phone; the cards allow that with `touch-action: manipulation`
 * where they used to take every touch for themselves. The keyboard picks up with Space.
 */
export function useCardSensors(coordinateGetter: KeyboardCoordinateGetter) {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );
}

/**
 * For a control inside a card: a press on it is the control's own and never the start of a
 * drag, whichever way the press arrives.
 */
export const notADrag = {
  onMouseDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onTouchStart: (event: { stopPropagation: () => void }) => event.stopPropagation(),
  onPointerDown: (event: { stopPropagation: () => void }) => event.stopPropagation(),
};

import { PREVIEW_IMAGE_TYPES } from '@gameweld/domain';
import { t } from '../i18n/index.ts';

/** Shown when a drop on a card carried no image the app can use as a cover. */
export const NOT_A_COVER_IMAGE = t(
  'Drop a PNG, JPEG, GIF, or WebP image on a card to make it the cover.',
);

/** The dropped files a card uploads, in drop order, so the last one becomes the cover. */
export const coverImages = (files: File[]): File[] =>
  files.filter((f) => PREVIEW_IMAGE_TYPES.has(f.type));

import type { AvatarCrop } from '@gameweld/domain';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/** The stage, and the circle inside it that becomes the picture. */
const STAGE = 288;
const CIRCLE = 240;
const INSET = (STAGE - CIRCLE) / 2;
/** Never zoom so close that the circle covers fewer source pixels than this. */
const MIN_SOURCE = 24;
const STEP = 10;

interface View {
  /** Stage pixels per source pixel. */
  scale: number;
  /** The picture's top-left corner on the stage. */
  x: number;
  y: number;
}

/**
 * Chooses the circular part of a larger picture: the circle stays put and the picture moves and
 * zooms beneath it, by dragging, the arrow keys, the wheel, or the zoom slider. The result is the
 * circle as fractions of the picture, which the server applies to its own copy.
 */
export function AvatarCropper({
  src,
  initial,
  busy = false,
  onSave,
  onCancel,
}: {
  src: string;
  initial?: AvatarCrop | undefined;
  busy?: boolean;
  onSave: (crop: AvatarCrop) => void;
  onCancel: () => void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; view: View } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [failed, setFailed] = useState(false);

  const minScale = natural ? CIRCLE / Math.min(natural.w, natural.h) : 1;
  const maxScale = Math.max(minScale, Math.min(minScale * 8, CIRCLE / MIN_SOURCE));

  /** Keeps the circle wholly on the picture. */
  function clamp(v: View): View {
    if (!natural) return v;
    const scale = Math.min(maxScale, Math.max(minScale, v.scale));
    const [w, h] = [natural.w * scale, natural.h * scale];
    return {
      scale,
      x: Math.min(INSET, Math.max(INSET + CIRCLE - w, v.x)),
      y: Math.min(INSET, Math.max(INSET + CIRCLE - h, v.y)),
    };
  }

  function loaded(img: HTMLImageElement) {
    const [w, h] = [img.naturalWidth, img.naturalHeight];
    setNatural({ w, h });
    const fit = CIRCLE / Math.min(w, h);
    const scale = initial ? CIRCLE / (initial.size * w) : fit;
    const start = initial
      ? { scale, x: INSET - initial.left * w * scale, y: INSET - initial.top * h * scale }
      : { scale, x: (STAGE - w * scale) / 2, y: (STAGE - h * scale) / 2 };
    // clamp() needs natural in state; compute the same bounds here for the first view.
    const s = Math.max(fit, scale);
    setView({
      scale: s,
      x: Math.min(INSET, Math.max(INSET + CIRCLE - w * s, start.x)),
      y: Math.min(INSET, Math.max(INSET + CIRCLE - h * s, start.y)),
    });
  }

  const pan = (dx: number, dy: number) =>
    setView((v) => v && clamp({ ...v, x: v.x + dx, y: v.y + dy }));

  /** Zooms about the circle's centre, so what is in the middle stays there. */
  const zoomTo = (scale: number) =>
    setView((v) => {
      if (!v) return v;
      const c = STAGE / 2;
      const next = Math.min(maxScale, Math.max(minScale, scale));
      return clamp({
        scale: next,
        x: c - ((c - v.x) / v.scale) * next,
        y: c - ((c - v.y) / v.scale) * next,
      });
    });

  // The wheel zooms; React's wheel listener is passive, so the page would scroll too.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => {
        if (!v || !natural) return v;
        const c = STAGE / 2;
        const next = Math.min(maxScale, Math.max(minScale, v.scale * Math.exp(-e.deltaY * 0.002)));
        return clamp({
          scale: next,
          x: c - ((c - v.x) / v.scale) * next,
          y: c - ((c - v.y) / v.scale) * next,
        });
      });
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  });

  function onPointerDown(e: PointerEvent) {
    if (!view || e.button !== 0) return;
    stage.current!.setPointerCapture(e.pointerId);
    drag.current = { pointer: e.pointerId, x: e.clientX, y: e.clientY, view };
  }
  function onPointerMove(e: PointerEvent) {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    setView(clamp({ ...d.view, x: d.view.x + e.clientX - d.x, y: d.view.y + e.clientY - d.y }));
  }
  const onPointerUp = () => (drag.current = null);

  function onKeyDown(e: KeyboardEvent) {
    const step = e.shiftKey ? STEP * 4 : STEP;
    // Arrows move the circle over the picture, so the picture moves the other way.
    if (e.key === 'ArrowLeft') pan(step, 0);
    else if (e.key === 'ArrowRight') pan(-step, 0);
    else if (e.key === 'ArrowUp') pan(0, step);
    else if (e.key === 'ArrowDown') pan(0, -step);
    else if (e.key === '+' || e.key === '=') zoomTo((view?.scale ?? 1) * 1.1);
    else if (e.key === '-') zoomTo((view?.scale ?? 1) / 1.1);
    else return;
    e.preventDefault();
  }

  /** The slider moves on a log scale, so each step zooms by the same ratio. */
  const range = Math.log(maxScale / minScale);
  const zoomValue =
    view && range > 0 ? Math.round((Math.log(view.scale / minScale) / range) * 1000) : 0;

  function crop(): AvatarCrop {
    const { scale, x, y } = view!;
    const [w, h] = [natural!.w * scale, natural!.h * scale];
    const fraction = (n: number) => Math.min(1, Math.max(0, Math.round(n * 1e6) / 1e6));
    return {
      left: fraction((INSET - x) / w),
      top: fraction((INSET - y) / h),
      size: fraction(CIRCLE / w),
    };
  }

  const preview = (px: number) => {
    const f = px / CIRCLE;
    return (
      <span className="crop-preview-circle" style={{ width: px, height: px }}>
        {view && natural && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              left: (view.x - INSET) * f,
              top: (view.y - INSET) * f,
              width: natural.w * view.scale * f,
              height: natural.h * view.scale * f,
            }}
          />
        )}
      </span>
    );
  };

  if (failed) return <p className="error">This picture could not be shown. Try another file.</p>;

  return (
    <div className="cropper" data-testid="avatar-cropper">
      <div
        ref={stage}
        className="crop-stage"
        style={{ width: STAGE, height: STAGE }}
        tabIndex={0}
        role="group"
        aria-label="Choose the part of the picture inside the circle: drag the picture or use the arrow keys; plus and minus zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => loaded(e.currentTarget)}
          onError={() => setFailed(true)}
          style={
            view && natural
              ? {
                  left: view.x,
                  top: view.y,
                  width: natural.w * view.scale,
                  height: natural.h * view.scale,
                }
              : { visibility: 'hidden' }
          }
        />
        <span
          className="crop-circle"
          style={{ left: INSET, top: INSET, width: CIRCLE, height: CIRCLE }}
          aria-hidden="true"
        />
      </div>
      <div className="crop-side">
        <label className="crop-zoom">
          Zoom
          <input
            type="range"
            min={0}
            max={1000}
            value={zoomValue}
            disabled={!view || range <= 0}
            onChange={(e) => zoomTo(minScale * Math.exp((Number(e.target.value) / 1000) * range))}
          />
        </label>
        <div className="crop-preview" aria-hidden="true">
          {preview(96)}
          {preview(28)}
        </div>
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={!view || busy}
            onClick={() => onSave(crop())}
          >
            {busy ? 'Saving…' : 'Save picture'}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

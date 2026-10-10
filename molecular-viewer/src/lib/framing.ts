/**
 * Fitting the molecule into the part of the 3D view that no floating panel
 * covers. 3Dmol's zoomTo() fits the whole canvas, but the display bar (and,
 * on phones, the info card) sit on top of it, so tall molecules were cut off.
 */

export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}


/** Gap kept between the molecule and a panel. */
const MARGIN = 12;
/** Width of the centre column, as a fraction of the stage, that panels are tested against. */
const CENTRE_FRACTION = 0.3;
/** Never shrink by more than this, however crowded the screen. */
const MIN_SCALE = 0.5;

/**
 * Zoom factor (to apply after zoomTo(); below 1 zooms out) that keeps a
 * centred molecule clear of the panels at the top and bottom of the stage.
 * The view stays centred, so the larger of the two insets applies to both
 * ends; 3Dmol's translate() works in depth-dependent units, so shifting the
 * centre by a pixel amount is not reliable.
 *
 * Only panels that reach into the centre column count: corner panels (info
 * card and toolbar on a desktop, the legend) float beside the molecule, not
 * over it. A panel in the upper half pushes the band down; one in the lower
 * half pushes it up.
 */
export function fitBetweenPanels(stage: Box, panels: readonly Box[]): number {
  const height = stage.bottom - stage.top;
  const width = stage.right - stage.left;
  if (height <= 0 || width <= 0) return 1;

  const centreX = (stage.left + stage.right) / 2;
  const half = (width * CENTRE_FRACTION) / 2;
  const midY = (stage.top + stage.bottom) / 2;
  let top = 0;
  let bottom = 0;
  for (const p of panels) {
    if (p.bottom <= p.top || p.right <= p.left) continue; // hidden
    if (p.right <= centreX - half || p.left >= centreX + half) continue; // a corner panel
    if ((p.top + p.bottom) / 2 < midY) top = Math.max(top, p.bottom - stage.top + MARGIN);
    else bottom = Math.max(bottom, stage.bottom - p.top + MARGIN);
  }
  const inset = Math.max(top, bottom);
  if (inset === 0) return 1;
  return Math.max(MIN_SCALE, (height - 2 * inset) / height);
}

/** Selector for the panels that float over the 3D view. */
export const PANEL_SELECTOR = '.info-card, .tools, .legend, .display-bar';

/** Measure the stage and its floating panels from the DOM. */
export function measurePanels(stage: Element): { stage: Box; panels: Box[] } {
  const panels = Array.from(stage.querySelectorAll(PANEL_SELECTOR), (el) => el.getBoundingClientRect());
  return { stage: stage.getBoundingClientRect(), panels };
}

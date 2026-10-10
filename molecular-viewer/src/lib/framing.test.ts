import { describe, expect, it } from 'vitest';
import { fitBetweenPanels, measurePanels, type Box } from './framing';

const box = (left: number, top: number, right: number, bottom: number): Box => ({ left, top, right, bottom });

// The desktop layout the screenshots use: a 1300 x 739 stage under the top bar.
const STAGE = box(0, 61, 1300, 800);
const INFO_CARD = box(16, 77, 436, 192); // top left corner
const TOOLS = box(1124, 77, 1284, 123); // top right corner
const LEGEND = box(1140, 634, 1284, 716); // bottom right corner
const DISPLAY_BAR = box(220, 737, 1080, 784); // bottom centre

describe('fitBetweenPanels', () => {
  it('leaves the zoom alone when no panel reaches the centre', () => {
    expect(fitBetweenPanels(STAGE, [INFO_CARD, TOOLS, LEGEND])).toBe(1);
  });

  it('zooms out to clear the display bar at both ends of a centred view', () => {
    const scale = fitBetweenPanels(STAGE, [INFO_CARD, TOOLS, LEGEND, DISPLAY_BAR]);
    // The bar's top is 63px above the stage bottom, plus a 12px gap.
    const inset = 800 - 737 + 12;
    expect(scale).toBeCloseTo((739 - 2 * inset) / 739, 6);
    expect(scale).toBeLessThan(1);
  });

  it('counts a top panel that spans the centre, as the info card does on a phone', () => {
    const stage = box(0, 56, 390, 844);
    const card = box(10, 66, 380, 200);
    const bar = box(10, 780, 380, 834);
    const scale = fitBetweenPanels(stage, [card, bar]);
    expect(scale).toBeCloseTo((788 - 2 * (200 - 56 + 12)) / 788, 6);
  });

  it('never shrinks below half size, however crowded the screen', () => {
    const tall = box(0, 0, 400, 300);
    expect(fitBetweenPanels(tall, [box(0, 0, 400, 140), box(0, 160, 400, 300)])).toBe(0.5);
  });

  it('ignores hidden panels and an unmeasured stage', () => {
    expect(fitBetweenPanels(STAGE, [box(0, 0, 0, 0)])).toBe(1);
    expect(fitBetweenPanels(box(0, 0, 0, 0), [DISPLAY_BAR])).toBe(1);
  });
});

describe('measurePanels', () => {
  it('reads the floating panels inside the stage and nothing else', () => {
    const stage = document.createElement('main');
    stage.innerHTML =
      '<div class="info-card"></div><div class="tools"></div><div class="legend"></div>' +
      '<div class="display-bar"></div><div class="hover-tip"></div>';
    const { panels } = measurePanels(stage);
    expect(panels).toHaveLength(4);
  });
});

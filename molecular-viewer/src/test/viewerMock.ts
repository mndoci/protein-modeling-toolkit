import { vi } from 'vitest';

/** Recording fake of the subset of the 3Dmol.js GLViewer API the app uses. */
export const viewerMock = {
  addModel: vi.fn(),
  setStyle: vi.fn(),
  addStyle: vi.fn(),
  setViewStyle: vi.fn(),
  setBackgroundColor: vi.fn(),
  zoomTo: vi.fn(),
  rotate: vi.fn(),
  zoom: vi.fn(),
  setView: vi.fn(),
  render: vi.fn(),
  removeAllModels: vi.fn(),
  resize: vi.fn(),
  clear: vi.fn(),
  setHoverable: vi.fn(),
  setHoverDuration: vi.fn(),
  pngURI: vi.fn(() => 'data:image/png;base64,AAAA'),
  addSurface: vi.fn(() => Promise.resolve()),
  removeAllSurfaces: vi.fn(),
};

export const SurfaceType = { VDW: 1, MS: 2, SAS: 3, SES: 4 } as const;

export const createViewerMock = vi.fn((_el: unknown, _config?: unknown) => viewerMock);

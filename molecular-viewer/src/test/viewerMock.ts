import { vi } from 'vitest';

/** Recording fake of the subset of the 3Dmol.js GLViewer API the app uses. */
export const viewerMock = {
  addModel: vi.fn(),
  setStyle: vi.fn(),
  zoomTo: vi.fn(),
  render: vi.fn(),
  removeAllModels: vi.fn(),
  resize: vi.fn(),
  clear: vi.fn(),
};

export const createViewerMock = vi.fn((_el: unknown, _config?: unknown) => viewerMock);

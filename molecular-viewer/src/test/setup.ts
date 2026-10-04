import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { viewerMock, createViewerMock } from './viewerMock';

// jsdom has no WebGL, so every test runs against a recording fake of 3Dmol.js.
vi.mock('3dmol', async () => {
  const m = await import('./viewerMock');
  return { createViewer: m.createViewerMock, SurfaceType: m.SurfaceType };
});

afterEach(() => {
  cleanup();
  createViewerMock.mockClear();
  for (const fn of Object.values(viewerMock)) fn.mockClear();
  viewerMock.addSurface.mockImplementation(() => Promise.resolve());
});

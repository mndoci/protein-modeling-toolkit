import { useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import type { StructureFormat } from '../lib/structure';
import { buildStyleOps, type DisplayOptions } from '../lib/styles';
import { VIEWER_BACKGROUND, type Theme } from '../lib/theme';

type Viewer = ReturnType<typeof $3Dmol.createViewer>;

export interface LoadedStructure {
  name: string;
  text: string;
  format: StructureFormat;
  /** Turn applied once after loading, before the first render. */
  rotation?: { angle: number; axis: 'x' | 'y' | 'z' };
}

interface Props {
  structure: LoadedStructure | null;
  display: DisplayOptions;
  /** Chain IDs in file order; keeps "by chain" colours stable. */
  chains: readonly string[];
  theme: Theme;
  /** Increment to re-centre the camera on the molecule. */
  resetSignal: number;
}

/**
 * Put the camera in its starting position: no leftover rotation from a
 * previous structure or from dragging, centred and zoomed to fit, then the
 * structure's own initial turn (if any).
 */
function frame(viewer: Viewer, structure: LoadedStructure) {
  viewer.setView([0, 0, 0, 0, 0, 0, 0, 1]);
  viewer.zoomTo();
  if (structure.rotation) viewer.rotate(structure.rotation.angle, structure.rotation.axis);
}

/** Thin React wrapper around a 3Dmol.js WebGL viewer. */
export function MoleculeViewer({ structure, display, chains, theme, resetSignal }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The viewer is created once, so read the initial theme from a ref.
  const themeRef = useRef(theme);

  // Create the viewer once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const viewer = $3Dmol.createViewer(el, {
        backgroundColor: VIEWER_BACKGROUND[themeRef.current],
        antialias: true,
        // Smoother cartoon splines than the default of 10.
        cartoonQuality: 16,
      });
      if (!viewer) throw new Error('no viewer');
      // A thin dark edge makes overlapping ribbons easy to tell apart.
      viewer.setViewStyle({ style: 'outline', width: 0.08, color: '#000000' });
      viewerRef.current = viewer;
    } catch {
      setError('3D rendering is unavailable: your browser does not support WebGL.');
      return;
    }
    const onResize = () => viewerRef.current?.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      viewerRef.current?.clear();
      viewerRef.current = null;
    };
  }, []);

  // (Re)load the model when the structure changes. Styling is applied by the
  // effect below, which also runs after this one on every structure change.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.removeAllModels();
    if (structure) {
      viewer.addModel(structure.text, structure.format);
      frame(viewer, structure);
    }
    viewer.render();
  }, [structure]);

  // Apply the style; on a style change this restyles without reloading.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !structure) return;
    for (const { mode, sel, style } of buildStyleOps(display, chains)) {
      if (mode === 'set') viewer.setStyle(sel, style);
      else viewer.addStyle(sel, style);
    }
    viewer.render();
  }, [display, chains, structure]);

  // Follow the light / dark theme.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.setBackgroundColor(VIEWER_BACKGROUND[theme], 1);
    viewer.render();
  }, [theme]);

  // Reset the camera to the same framing a fresh load gets.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !structure || resetSignal === 0) return;
    frame(viewer, structure);
    viewer.render();
    // Only a new reset request should re-frame; a new structure frames itself.
  }, [resetSignal]);

  const label = structure
    ? `3D view of ${structure.name}. Drag to rotate, scroll to zoom, right-drag to pan.`
    : '3D view (no structure loaded)';

  return (
    <div className="viewer-frame">
      {error ? (
        <p role="alert" className="viewer-error">
          {error}
        </p>
      ) : null}
      <div
        ref={containerRef}
        className="viewer-canvas"
        role="img"
        aria-label={label}
        data-testid="viewer-canvas"
      />
      {!structure && !error ? (
        <p className="viewer-placeholder">Load a structure to see it here.</p>
      ) : null}
    </div>
  );
}

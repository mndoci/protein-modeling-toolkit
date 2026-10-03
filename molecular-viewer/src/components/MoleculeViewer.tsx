import { useEffect, useRef, useState } from 'react';
import * as $3Dmol from '3dmol';
import type { StructureFormat } from '../lib/structure';
import { buildStyle, type ColorScheme, type Representation } from '../lib/styles';

type Viewer = ReturnType<typeof $3Dmol.createViewer>;

export interface LoadedStructure {
  name: string;
  text: string;
  format: StructureFormat;
}

interface Props {
  structure: LoadedStructure | null;
  representation: Representation;
  colorScheme: ColorScheme;
  /** Increment to re-centre the camera on the molecule. */
  resetSignal: number;
}

/** Thin React wrapper around a 3Dmol.js WebGL viewer. */
export function MoleculeViewer({ structure, representation, colorScheme, resetSignal }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Create the viewer once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    try {
      const viewer = $3Dmol.createViewer(el, { backgroundColor: 'white' });
      if (!viewer) throw new Error('no viewer');
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
      viewer.zoomTo();
    }
    viewer.render();
  }, [structure]);

  // Apply the style; on a style change this restyles without reloading.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !structure) return;
    viewer.setStyle({}, buildStyle(representation, colorScheme));
    viewer.render();
  }, [representation, colorScheme, structure]);

  // Reset the camera.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !structure || resetSignal === 0) return;
    viewer.zoomTo();
    viewer.render();
  }, [resetSignal, structure]);

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

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import * as $3Dmol from '3dmol';
import { describeAtom, type HoverLabel, type HoveredAtom } from '../lib/hover';
import type { StructureFormat } from '../lib/structure';
import { buildStyleOps, buildSurface, type DisplayOptions, type ResidueRange } from '../lib/styles';
import { VIEWER_BACKGROUND, type Theme } from '../lib/theme';

type Viewer = ReturnType<typeof $3Dmol.createViewer>;

export interface LoadedStructure {
  name: string;
  text: string;
  format: StructureFormat;
  /** Turn applied once after loading, before the first render. */
  rotation?: { angle: number; axis: 'x' | 'y' | 'z' };
}

/** What the rest of the app can ask of the viewer. */
export interface MoleculeViewerHandle {
  /** The current view as a PNG data URL, or null if nothing can be captured. */
  snapshot(): string | null;
}

interface Props {
  structure: LoadedStructure | null;
  display: DisplayOptions;
  /** Chain IDs in file order; keeps "by chain" colours stable. */
  chains: readonly string[];
  /** Polymer residue numbers, for rainbow-colouring a surface. */
  residueRange?: ResidueRange | null;
  theme: Theme;
  /** Increment to re-centre the camera on the molecule. */
  resetSignal: number;
  /** Told when a molecular surface starts and finishes computing. */
  onSurfaceBusy?: (busy: boolean) => void;
  ref?: Ref<MoleculeViewerHandle>;
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
export function MoleculeViewer({
  structure,
  display,
  chains,
  residueRange,
  theme,
  resetSignal,
  onSurfaceBusy,
  ref,
}: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<HoverLabel | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0, dragging: false });
  // The viewer is created once, so read the initial theme from a ref.
  const themeRef = useRef(theme);
  const surfaceBusyRef = useRef(onSurfaceBusy);
  surfaceBusyRef.current = onSurfaceBusy;

  useImperativeHandle(ref, () => ({
    snapshot() {
      const viewer = viewerRef.current;
      if (!viewer || !structure) return null;
      viewer.render();
      return viewer.pngURI();
    },
  }));

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
      viewer.setHoverDuration(60);
      viewerRef.current = viewer;
    } catch {
      setError('3D rendering is unavailable: your browser does not support WebGL.');
      return;
    }
    const onResize = () => viewerRef.current?.resize();
    window.addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', onResize);
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
    viewer.removeAllSurfaces();
    setHover(null);
    if (structure) {
      viewer.addModel(structure.text, structure.format);
      // Hover is per atom, so it has to be switched on for each new model.
      viewer.setHoverable(
        {},
        true,
        (atom: HoveredAtom) => {
          if (!pointer.current.dragging) setHover(describeAtom(atom));
        },
        () => setHover(null),
      );
      frame(viewer, structure);
    }
    viewer.render();
  }, [structure]);

  // Apply the style; on a style change this restyles without reloading.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !structure) return;
    for (const { mode, sel, style } of buildStyleOps(display, chains, residueRange ?? undefined)) {
      if (mode === 'set') viewer.setStyle(sel, style);
      else viewer.addStyle(sel, style);
    }
    viewer.removeAllSurfaces();
    const surface = buildSurface(display, chains, residueRange ?? undefined);
    if (surface) {
      surfaceBusyRef.current?.(true);
      let current = true;
      Promise.resolve(viewer.addSurface($3Dmol.SurfaceType.MS, surface.style, surface.sel))
        .catch(() => undefined)
        .finally(() => {
          if (!current) return;
          surfaceBusyRef.current?.(false);
          viewer.render();
        });
      viewer.render();
      return () => {
        // A newer style replaced this surface before it finished.
        current = false;
        surfaceBusyRef.current?.(false);
      };
    }
    viewer.render();
  }, [display, chains, residueRange, structure]);

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

  /** Keep the hover label next to the pointer without re-rendering React. */
  function placeTip() {
    const tip = tipRef.current;
    if (!tip) return;
    tip.style.transform = `translate(${pointer.current.x + 14}px, ${pointer.current.y - 44}px)`;
  }

  // Position a freshly shown label before it paints.
  useEffect(placeTip, [hover]);

  const label = structure
    ? `3D view of ${structure.name}. Drag to rotate, scroll to zoom, right-drag to pan.`
    : '3D view (no structure loaded)';

  return (
    <div
      ref={frameRef}
      className="viewer-frame"
      onPointerMove={(e) => {
        const box = frameRef.current?.getBoundingClientRect();
        pointer.current.x = e.clientX - (box?.left ?? 0);
        pointer.current.y = e.clientY - (box?.top ?? 0);
        placeTip();
      }}
      onPointerDown={() => {
        pointer.current.dragging = true;
        setHover(null);
      }}
      onPointerUp={() => (pointer.current.dragging = false)}
      onPointerLeave={() => {
        pointer.current.dragging = false;
        setHover(null);
      }}
    >
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
      {hover ? (
        // Pointer-only extra detail; the same facts are in the info card.
        <div ref={tipRef} className="hover-tip glass" data-testid="hover-tip" aria-hidden="true">
          <b>{hover.title}</b> · {hover.detail}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useId, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { DisplayBar } from './components/DisplayBar';
import {
  CameraIcon,
  CloseIcon,
  ExpandIcon,
  LinkIcon,
  LogoIcon,
  MoonIcon,
  ResetIcon,
  SearchIcon,
  ShrinkIcon,
  SunIcon,
  UploadIcon,
} from './components/Icons';
import { InfoCard } from './components/InfoCard';
import { Legend } from './components/Legend';
import {
  MoleculeViewer,
  type LoadedStructure,
  type MoleculeViewerHandle,
} from './components/MoleculeViewer';
import { SamplePicker } from './components/SamplePicker';
import { fetchPdb } from './lib/rcsb';
import { SAMPLES, findSample, loadSampleText, type Sample } from './lib/samples';
import { buildShareUrl, parseShareQuery, type StructureSource } from './lib/share';
import { detectFormat, parseStructure, type StructureInfo } from './lib/structure';
import { DEFAULT_DISPLAY, type DisplayOptions } from './lib/styles';
import { applyTheme, getInitialTheme, saveTheme, type Theme } from './lib/theme';

/** Refuse uploads larger than this; 3Dmol gets sluggish well before it. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

interface Loaded {
  structure: LoadedStructure;
  info: StructureInfo;
  source: StructureSource;
  /** Base name for a saved image, e.g. "4HHB". */
  fileStem: string;
}

/** Fullscreen support differs by browser (iPhone Safari has none for elements). */
const canFullscreen = () => typeof document !== 'undefined' && document.fullscreenEnabled === true;

interface AppProps {
  fetchImpl?: typeof fetch;
  /** Where to read a shared view from; defaults to the page's own query string. */
  initialSearch?: string;
}

export default function App({ fetchImpl = fetch, initialSearch }: AppProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** What is loading right now, for the in-viewer indicator and the Fetch label. */
  const [busy, setBusy] = useState<{ kind: 'fetch' | 'sample'; label: string } | null>(null);
  const [surfaceBusy, setSurfaceBusy] = useState(false);
  const [pdbId, setPdbId] = useState('');
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY);
  const [resetSignal, setResetSignal] = useState(0);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [fullscreen, setFullscreen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const stageRef = useRef<HTMLElement>(null);
  const viewerRef = useRef<MoleculeViewerHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = { file: useId(), pdb: useId() };

  useEffect(() => applyTheme(theme), [theme]);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    saveTheme(next);
  }

  const chains = useMemo(() => loaded?.info.chains.map((c) => c.id) ?? [], [loaded]);
  const sample = loaded?.source.kind === 'sample' ? findSample(loaded.source.id) : undefined;

  function update(patch: Partial<DisplayOptions>) {
    setDisplay((d) => ({ ...d, ...patch }));
  }

  // Notices ("Link copied") fade on their own.
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(t);
  }, [notice]);

  /** Parse text, and only swap it into the viewer if it parses. */
  function load(
    name: string,
    text: string,
    source: StructureSource,
    fileStem: string,
    fileName?: string,
    rotation?: LoadedStructure['rotation'],
  ): boolean {
    const format = detectFormat(text, fileName);
    try {
      const info = parseStructure(text, format);
      setLoaded({ structure: { name, text, format, rotation }, info, source, fileStem });
      setError(null);
      return true;
    } catch (err) {
      setError(`Could not read ${name}: ${(err as Error).message}`);
      return false;
    }
  }

  async function openFile(file: File) {
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`${file.name} is larger than 50 MB.`);
      return;
    }
    const stem = file.name.replace(/\.[^.]+$/, '') || 'structure';
    load(file.name, await file.text(), { kind: 'file' }, stem, file.name);
  }

  async function fetchById(id: string, overrides?: Partial<DisplayOptions>) {
    setBusy({ kind: 'fetch', label: `Fetching ${id.trim().toUpperCase()} from RCSB…` });
    setError(null);
    try {
      const { id: pdb, text } = await fetchPdb(id, fetchImpl);
      if (load(pdb, text, { kind: 'pdb', id: pdb }, pdb, `${pdb}.pdb`) && overrides) update(overrides);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function loadSample(s: Sample, overrides?: Partial<DisplayOptions>) {
    setBusy({ kind: 'sample', label: `Loading ${s.id} ${s.name}…` });
    setError(null);
    try {
      const text = await loadSampleText(s.id);
      // Switch to the sample's showcase view only if it actually loaded.
      const name = `${s.id} (${s.name})`;
      if (load(name, text, { kind: 'sample', id: s.id }, s.id, `${s.id}.pdb`, s.rotation)) {
        setDisplay({ ...s.view, ...overrides });
      }
    } catch (err) {
      setError(`Could not load sample ${s.id}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  // Open a shared link: ?sample=4HHB or ?pdb=1UBQ, plus display options.
  const openedShared = useRef(false);
  useEffect(() => {
    if (openedShared.current) return; // StrictMode runs effects twice in development
    openedShared.current = true;
    const shared = parseShareQuery(initialSearch ?? window.location.search);
    if (!shared) return;
    if (shared.source.kind === 'sample') {
      const s = findSample(shared.source.id);
      if (s) void loadSample(s, shared.display);
    } else {
      void fetchById(shared.source.id, shared.display);
    }
    // Runs once, on first load only.
  }, []);

  function onFetch(e: FormEvent) {
    e.preventDefault();
    void fetchById(pdbId);
  }

  // --- toolbar ----------------------------------------------------------

  function saveImage() {
    const uri = viewerRef.current?.snapshot();
    if (!loaded || !uri) {
      setError('Could not capture the 3D view.');
      return;
    }
    const a = document.createElement('a');
    a.href = uri;
    a.download = `${loaded.fileStem}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    setNotice(`Saved ${a.download}`);
  }

  async function copyLink() {
    if (!loaded) return;
    const url = buildShareUrl(window.location.href, loaded.source, display);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied to the clipboard');
    } catch {
      // No clipboard access (insecure context, denied): show it instead.
      setNotice(`Copy this link: ${url}`);
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      setError('Full screen is not available here.');
    }
  }

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // --- drag and drop anywhere on the page ---------------------------------

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

  function onDragEnter(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }
  function onDragLeave(e: DragEvent) {
    if (!hasFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }
  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }
  function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void openFile(file);
  }

  const shareable = loaded !== null && loaded.source.kind !== 'file';
  const heading = sample ? sample.name : (loaded?.structure.name ?? '');

  return (
    <div
      className="app"
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            <LogoIcon />
          </span>
          <div>
            <h1>Molecular Viewer</h1>
            <p className="subtitle">protein-modeling-toolkit</p>
          </div>
        </div>

        <SamplePicker
          currentId={sample?.id ?? null}
          // Not disabled while loading: that would drop keyboard focus from the
          // trigger right after a pick. A pick made mid-load is ignored instead.
          onPick={(s) => {
            if (!busy) void loadSample(s);
          }}
        />

        <form onSubmit={onFetch} className="search" role="search">
          <label htmlFor={ids.pdb} className="visually-hidden">
            PDB ID from RCSB
          </label>
          <SearchIcon />
          <input
            id={ids.pdb}
            type="text"
            value={pdbId}
            onChange={(e) => setPdbId(e.target.value)}
            placeholder="Fetch by PDB ID, e.g. 1UBQ"
            maxLength={4}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className="btn primary" disabled={busy !== null || pdbId.trim() === ''}>
            {busy?.kind === 'fetch' ? 'Fetching…' : 'Fetch'}
          </button>
        </form>

        <label className="btn file-btn" htmlFor={ids.file}>
          <UploadIcon />
          <span>Open file</span>
          <input
            id={ids.file}
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept=".pdb,.ent,.cif,.mmcif"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await openFile(file);
              // Allow re-selecting the same file later.
              if (fileInputRef.current) fileInputRef.current.value = '';
            }}
          />
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label="Dark mode"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="icon-btn theme-toggle"
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <main className="stage" ref={stageRef}>
        <MoleculeViewer
          ref={viewerRef}
          structure={loaded?.structure ?? null}
          display={display}
          chains={chains}
          residueRange={loaded?.info.residueRange}
          theme={theme}
          resetSignal={resetSignal}
          onSurfaceBusy={setSurfaceBusy}
        />

        {loaded ? (
          <InfoCard
            heading={heading}
            subheading={sample?.id}
            description={sample?.blurb}
            info={loaded.info}
          />
        ) : null}

        {!loaded && !busy ? (
          <div className="empty-state">
            <h2>Pick a sample to get started</h2>
            <p>
              Use the <b>Sample</b> menu, fetch any entry by its PDB ID, or drop a <b>.pdb</b> or{' '}
              <b>.cif</b> file anywhere on the page.
            </p>
            <button type="button" className="btn primary" onClick={() => void loadSample(SAMPLES[0])}>
              Load {SAMPLES[0].id} {SAMPLES[0].name}
            </button>
          </div>
        ) : null}

        <div className="tools glass" role="toolbar" aria-label="View tools">
          <button
            type="button"
            className="icon-btn"
            aria-label="Reset view"
            title="Reset view"
            onClick={() => setResetSignal((n) => n + 1)}
            disabled={!loaded}
          >
            <ResetIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Save image"
            title="Save image (PNG)"
            onClick={saveImage}
            disabled={!loaded}
          >
            <CameraIcon />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Copy share link"
            title={
              loaded && !shareable
                ? 'Links cannot include a file opened from your computer'
                : 'Copy a link to this view'
            }
            onClick={copyLink}
            disabled={!shareable}
          >
            <LinkIcon />
          </button>
          {canFullscreen() ? (
            <button
              type="button"
              className="icon-btn"
              aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
              onClick={toggleFullscreen}
            >
              {fullscreen ? <ShrinkIcon /> : <ExpandIcon />}
            </button>
          ) : null}
        </div>

        {loaded ? (
          <Legend
            scheme={display.colorScheme}
            chains={loaded.info.chains}
            ligands={display.showLigands && loaded.info.ligands.length > 0}
          />
        ) : null}

        {loaded ? <DisplayBar display={display} onChange={update} /> : null}

        <div className="status-area">
          {busy || surfaceBusy ? (
            <p className="loading glass" role="status">
              <span className="spinner" aria-hidden="true" />
              {busy ? busy.label : 'Computing surface…'}
            </p>
          ) : null}
          <div aria-live="polite">{notice ? <p className="notice glass">{notice}</p> : null}</div>
          {error ? (
            <div role="alert" className="error">
              <span>{error}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label="Dismiss error"
                onClick={() => setError(null)}
              >
                <CloseIcon />
              </button>
            </div>
          ) : null}
        </div>

        {dragging ? (
          <div className="drop-overlay" aria-hidden="true">
            <p>Drop a .pdb or .cif file to open it</p>
          </div>
        ) : null}
      </main>
    </div>
  );
}

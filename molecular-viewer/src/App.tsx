import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { MoleculeViewer, type LoadedStructure } from './components/MoleculeViewer';
import { StructureInfoPanel } from './components/StructureInfoPanel';
import { fetchPdb } from './lib/rcsb';
import { SAMPLES, findSample, loadSampleText } from './lib/samples';
import { detectFormat, parseStructure, type StructureInfo } from './lib/structure';
import {
  COLOR_SCHEMES,
  COLOR_SCHEME_LABELS,
  DEFAULT_DISPLAY,
  REPRESENTATIONS,
  REPRESENTATION_LABELS,
  type ColorScheme,
  type DisplayOptions,
  type Representation,
} from './lib/styles';
import { applyTheme, getInitialTheme, saveTheme, type Theme } from './lib/theme';

/** Refuse uploads larger than this; 3Dmol gets sluggish well before it. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

interface Loaded {
  structure: LoadedStructure;
  info: StructureInfo;
}

export default function App({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'fetch' | 'sample' | null>(null);
  const [pdbId, setPdbId] = useState('');
  const [sampleId, setSampleId] = useState(SAMPLES[0].id);
  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY);
  const [resetSignal, setResetSignal] = useState(0);
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = {
    file: useId(),
    pdb: useId(),
    sample: useId(),
    sampleBlurb: useId(),
    rep: useId(),
    color: useId(),
    ligands: useId(),
    water: useId(),
  };

  useEffect(() => applyTheme(theme), [theme]);

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    saveTheme(next);
  }

  const chains = useMemo(() => loaded?.info.chains.map((c) => c.id) ?? [], [loaded]);
  const sample = findSample(sampleId);

  function update(patch: Partial<DisplayOptions>) {
    setDisplay((d) => ({ ...d, ...patch }));
  }

  /** Parse text, and only swap it into the viewer if it parses. */
  function load(
    name: string,
    text: string,
    fileName?: string,
    rotation?: LoadedStructure['rotation'],
  ): boolean {
    const format = detectFormat(text, fileName);
    try {
      const info = parseStructure(text, format);
      setLoaded({ structure: { name, text, format, rotation }, info });
      setError(null);
      return true;
    } catch (err) {
      setError(`Could not read ${name}: ${(err as Error).message}`);
      return false;
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`${file.name} is larger than 50 MB.`);
    } else {
      load(file.name, await file.text(), file.name);
    }
    // Allow re-selecting the same file later.
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function onFetch(e: FormEvent) {
    e.preventDefault();
    setBusy('fetch');
    setError(null);
    try {
      const { id, text } = await fetchPdb(pdbId, fetchImpl);
      load(id, text, `${id}.pdb`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onLoadSample() {
    if (!sample) return;
    setBusy('sample');
    setError(null);
    try {
      const text = await loadSampleText(sample.id);
      // Switch to the sample's showcase view only if it actually loaded.
      const name = `${sample.id} (${sample.name})`;
      if (load(name, text, `${sample.id}.pdb`, sample.rotation)) setDisplay(sample.view);
    } catch (err) {
      setError(`Could not load sample ${sample.id}: ${(err as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Molecular Viewer</h1>
          <p className="subtitle">Part of the protein-modeling-toolkit</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={theme === 'dark'}
          className="theme-toggle"
          onClick={toggleTheme}
        >
          Dark mode
        </button>
      </header>

      <main className="layout">
        <aside className="sidebar" aria-label="Viewer controls">
          <section className="panel" aria-labelledby="load-heading">
            <h2 id="load-heading">Load a structure</h2>

            <label htmlFor={ids.sample}>Sample structure</label>
            <select
              id={ids.sample}
              value={sampleId}
              onChange={(e) => setSampleId(e.target.value)}
              aria-describedby={ids.sampleBlurb}
            >
              {SAMPLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.name}
                </option>
              ))}
            </select>
            <p id={ids.sampleBlurb} className="hint" data-testid="sample-blurb">
              {sample?.blurb}
            </p>
            <button type="button" onClick={onLoadSample} disabled={busy !== null}>
              Load sample
            </button>

            <label htmlFor={ids.file}>Upload a PDB or mmCIF file</label>
            <input
              id={ids.file}
              ref={fileInputRef}
              type="file"
              accept=".pdb,.ent,.cif,.mmcif"
              onChange={onFile}
            />

            <form onSubmit={onFetch} className="fetch-form">
              <label htmlFor={ids.pdb}>PDB ID from RCSB</label>
              <div className="row">
                <input
                  id={ids.pdb}
                  type="text"
                  value={pdbId}
                  onChange={(e) => setPdbId(e.target.value)}
                  placeholder="e.g. 1UBQ"
                  maxLength={4}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="submit" disabled={busy !== null || pdbId.trim() === ''}>
                  {busy === 'fetch' ? 'Fetching…' : 'Fetch'}
                </button>
              </div>
            </form>
          </section>

          <section className="panel" aria-labelledby="display-heading">
            <h2 id="display-heading">Display</h2>
            <label htmlFor={ids.rep}>Style</label>
            <select
              id={ids.rep}
              value={display.representation}
              onChange={(e) => update({ representation: e.target.value as Representation })}
            >
              {REPRESENTATIONS.map((r) => (
                <option key={r} value={r}>
                  {REPRESENTATION_LABELS[r]}
                </option>
              ))}
            </select>

            <label htmlFor={ids.color}>Color</label>
            <select
              id={ids.color}
              value={display.colorScheme}
              onChange={(e) => update({ colorScheme: e.target.value as ColorScheme })}
            >
              {COLOR_SCHEMES.map((c) => (
                <option key={c} value={c}>
                  {COLOR_SCHEME_LABELS[c]}
                </option>
              ))}
            </select>

            <div className="check">
              <input
                id={ids.ligands}
                type="checkbox"
                checked={display.showLigands}
                onChange={(e) => update({ showLigands: e.target.checked })}
              />
              <label htmlFor={ids.ligands}>Show ligands</label>
            </div>
            <div className="check">
              <input
                id={ids.water}
                type="checkbox"
                checked={display.showWater}
                onChange={(e) => update({ showWater: e.target.checked })}
              />
              <label htmlFor={ids.water}>Show water</label>
            </div>

            <button
              type="button"
              onClick={() => setResetSignal((n) => n + 1)}
              disabled={!loaded}
            >
              Reset view
            </button>
          </section>

          <div aria-live="polite" className="status">
            {error ? (
              <p role="alert" className="error">
                {error}
              </p>
            ) : null}
          </div>

          {loaded ? <StructureInfoPanel name={loaded.structure.name} info={loaded.info} /> : null}
        </aside>

        <MoleculeViewer
          structure={loaded?.structure ?? null}
          display={display}
          chains={chains}
          theme={theme}
          resetSignal={resetSignal}
        />
      </main>
    </div>
  );
}

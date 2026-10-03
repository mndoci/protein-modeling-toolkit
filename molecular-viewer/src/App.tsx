import { useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import samplePdb from './assets/1CRN.pdb?raw';
import { MoleculeViewer, type LoadedStructure } from './components/MoleculeViewer';
import { StructureInfoPanel } from './components/StructureInfoPanel';
import { fetchPdb } from './lib/rcsb';
import { detectFormat, parseStructure, type StructureInfo } from './lib/structure';
import {
  COLOR_SCHEMES,
  COLOR_SCHEME_LABELS,
  REPRESENTATIONS,
  REPRESENTATION_LABELS,
  type ColorScheme,
  type Representation,
} from './lib/styles';

/** Refuse uploads larger than this; 3Dmol gets sluggish well before it. */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

interface Loaded {
  structure: LoadedStructure;
  info: StructureInfo;
}

export default function App({ fetchImpl = fetch }: { fetchImpl?: typeof fetch }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pdbId, setPdbId] = useState('');
  const [representation, setRepresentation] = useState<Representation>('cartoon');
  const [colorScheme, setColorScheme] = useState<ColorScheme>('secondary');
  const [resetSignal, setResetSignal] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ids = { file: useId(), pdb: useId(), rep: useId(), color: useId() };

  /** Parse text, and only swap it into the viewer if it parses. */
  function load(name: string, text: string, fileName?: string) {
    const format = detectFormat(text, fileName);
    try {
      const info = parseStructure(text, format);
      setLoaded({ structure: { name, text, format }, info });
      setError(null);
    } catch (err) {
      setError(`Could not read ${name}: ${(err as Error).message}`);
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
    setBusy(true);
    setError(null);
    try {
      const { id, text } = await fetchPdb(pdbId, fetchImpl);
      load(id, text, `${id}.pdb`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Molecular Viewer</h1>
        <p className="subtitle">Part of the protein-modeling-toolkit</p>
      </header>

      <main className="layout">
        <aside className="sidebar" aria-label="Viewer controls">
          <section className="panel" aria-labelledby="load-heading">
            <h2 id="load-heading">Load a structure</h2>

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
                <button type="submit" disabled={busy || pdbId.trim() === ''}>
                  {busy ? 'Fetching…' : 'Fetch'}
                </button>
              </div>
            </form>

            <button type="button" onClick={() => load('1CRN (crambin)', samplePdb, '1CRN.pdb')}>
              Load sample (1CRN crambin)
            </button>
          </section>

          <section className="panel" aria-labelledby="display-heading">
            <h2 id="display-heading">Display</h2>
            <label htmlFor={ids.rep}>Style</label>
            <select
              id={ids.rep}
              value={representation}
              onChange={(e) => setRepresentation(e.target.value as Representation)}
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
              value={colorScheme}
              onChange={(e) => setColorScheme(e.target.value as ColorScheme)}
            >
              {COLOR_SCHEMES.map((c) => (
                <option key={c} value={c}>
                  {COLOR_SCHEME_LABELS[c]}
                </option>
              ))}
            </select>

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
          representation={representation}
          colorScheme={colorScheme}
          resetSignal={resetSignal}
        />
      </main>
    </div>
  );
}

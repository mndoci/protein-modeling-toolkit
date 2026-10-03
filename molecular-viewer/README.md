# molecular-viewer

An interactive 3D protein structure viewer that runs in the browser. Part of the
[protein-modeling-toolkit](../) (sibling of `secondary-structure-analysis/`).

Built with React + Vite + TypeScript; rendering is done by
[3Dmol.js](https://3dmol.org/) (WebGL).

## Features

- **Load a structure** three ways:
  - upload a local `.pdb` / `.ent` / `.cif` / `.mmcif` file (nothing is uploaded to a server -- the file is read in the browser),
  - type a 4-character PDB ID (e.g. `1UBQ`) to download it from [RCSB](https://www.rcsb.org/),
  - one click to open the bundled sample, **1CRN** (crambin).
- **Styles:** cartoon, stick, sphere, line.
- **Colors:** by chain, by secondary structure, or a rainbow spectrum from N- to C-terminus.
- **Structure info panel:** title, format, chain count, residue count, atom count, hetero-atom count, and a per-chain residue table for multi-chain structures.
- Rotate (drag), zoom (scroll), pan (right-drag), and a **Reset view** button.
- Keyboard accessible: every control has a visible label, focus outlines are shown, and errors are announced to screen readers.

## Requirements

- Node.js **22.12 or newer** (npm 10+)
- A browser with WebGL (any current Chrome, Firefox, Safari or Edge)

## Install and run

```bash
cd molecular-viewer
npm ci            # installs the exact versions in package-lock.json
npm run dev       # dev server at http://localhost:5173
```

Then click **Load sample (1CRN crambin)**, or enter a PDB ID and press **Fetch**.

Production build:

```bash
npm run build     # type-checks, then writes static files to dist/
npm run preview   # serves dist/ at http://localhost:4173
```

`dist/` is plain static files with relative paths, so it can be hosted anywhere
(GitHub Pages, S3, any web server).

## Tests

```bash
npm test          # runs the Vitest suite once
npm run typecheck # TypeScript only
```

The tests are hermetic: no network and no WebGL. 3Dmol.js is replaced by a
recording fake (`src/test/viewerMock.ts`) and RCSB downloads use an injected
fake `fetch`. They cover:

- **Structure parsing** against the bundled 1CRN file: 1 chain, 46 residues,
  327 atoms; plus first-model-only NMR handling, HETATM, insertion codes, and an
  mmCIF round-trip that must agree with the PDB parse.
- **RCSB fetching:** ID validation, the download URL, 404 / HTTP / network errors.
- **Style mapping** for all 12 style x color combinations.
- **The app UI** via React Testing Library: loading the sample, fetching by ID,
  uploading PDB and mmCIF files, switching style/color without reloading,
  reset view, error messages, and the no-WebGL fallback.

## Project layout

```
molecular-viewer/
├── index.html
├── package.json / package-lock.json   exact pinned versions
├── vite.config.ts                     build + Vitest config
├── tsconfig.json
└── src/
    ├── main.tsx                       entry point
    ├── App.tsx                        controls + layout
    ├── styles.css
    ├── assets/1CRN.pdb                bundled sample (crambin)
    ├── components/
    │   ├── MoleculeViewer.tsx         React wrapper around the 3Dmol.js viewer
    │   └── StructureInfoPanel.tsx
    ├── lib/
    │   ├── structure.ts               PDB / mmCIF summary parser (info panel)
    │   ├── rcsb.ts                    PDB ID validation + download
    │   └── styles.ts                  UI choices -> 3Dmol style spec
    └── test/                          Vitest setup + 3Dmol fake
```

## Notes

- The info panel counts **polymer** residues (ATOM records) and reports
  ligands/waters separately as hetero atoms. For multi-model files (NMR
  ensembles) only the first model is counted.
- Fetch by ID downloads the PDB-format file. Very large entries that RCSB only
  publishes as mmCIF will show a "not available" message; download the `.cif`
  from RCSB and upload it instead.
- `npm run build` prints an `[EVAL]` warning. It comes from inside 3Dmol.js
  (its optional string-callback feature) and is not used by this app.
- Coloring by secondary structure uses the HELIX/SHEET records in the file when
  present; otherwise 3Dmol.js computes them itself.

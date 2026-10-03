# molecular-viewer

An interactive 3D protein structure viewer that runs in the browser. Part of the
[protein-modeling-toolkit](../) (sibling of `secondary-structure-analysis/`).

Built with React + Vite + TypeScript; rendering is done by
[3Dmol.js](https://3dmol.org/) (WebGL).

**Live demo:** <https://main.d162l9aqc0o2mt.amplifyapp.com/> (hosted on AWS
Amplify, rebuilt automatically on every push to `main`).

## Features

- **Load a structure** three ways:
  - upload a local `.pdb` / `.ent` / `.cif` / `.mmcif` file (nothing is uploaded to a server -- the file is read in the browser),
  - type a 4-character PDB ID (e.g. `1UBQ`) to download it from [RCSB](https://www.rcsb.org/),
  - pick one of **8 bundled samples** and click **Load sample** (works offline; see below).
- **Dark mode:** the **Dark mode** switch in the header. It starts from your operating-system setting, remembers your choice, and recolours the 3D background too.
- **Polished cartoon:** round coils, flat ribbon helices, arrowheads showing β-strand direction, smoother curves and a thin outline so overlapping ribbons stay distinct. Helices, sheets and coil use a soft palette that reads on both light and dark backgrounds.
- **Styles:** cartoon, stick, sphere, line.
- **Colors:** by chain, by secondary structure, or a rainbow spectrum from N- to C-terminus.
- **Ligands and water:** *Show ligands* draws cofactors, inhibitors and ions as ball-and-stick (on by default); *Show water* adds crystal waters as small spheres (off by default). DNA/RNA bases are drawn as sticks in cartoon view.

## Sample structures

Each sample opens with the view that shows it off best. The PDB files are in
`src/assets/samples/` (public-domain data from the [RCSB PDB](https://www.rcsb.org/))
and are loaded on demand, so they add nothing to the first page load.

| ID | Structure | What it shows off |
| --- | --- | --- |
| 1CRN | crambin | Smallest sample: two helices and a short β-sheet |
| 1UBQ | ubiquitin | α/β fold with β-strand arrowheads |
| 1MBN | myoglobin | All-helical protein, spectrum colouring, heme ligand |
| 4HHB | hemoglobin | Four chains coloured by chain, four hemes |
| 1EMA | green fluorescent protein | β-barrel around a chromophore |
| 1TIM | triose phosphate isomerase | Two-subunit TIM barrel, spectrum colouring |
| 1HSG | HIV-1 protease + inhibitor | Drug target with a bound inhibitor |
| 1BNA | B-DNA dodecamer | A nucleic acid: double helix with base pairs |
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

Then pick a sample and click **Load sample**, or enter a PDB ID and press **Fetch**.

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
- **Samples:** every bundled sample loads and matches chain, residue and atom
  counts taken straight from its PDB file.
- **RCSB fetching:** ID validation, the download URL, 404 / HTTP / network errors.
- **Style mapping** for all 12 style x color combinations, the colour palettes
  (including the arrowhead fix), and the ligand / water / DNA-base layers.
- **Theme:** OS preference, saved choice, corrupt or blocked storage.
- **The app UI** via React Testing Library: loading samples (and that each
  applies its own view), fetching by ID, uploading PDB and mmCIF files,
  switching style/color/ligands/water without reloading, dark mode, reset view,
  error messages, and the no-WebGL fallback.

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
    ├── assets/samples/*.pdb           the 8 bundled sample structures
    ├── components/
    │   ├── MoleculeViewer.tsx         React wrapper around the 3Dmol.js viewer
    │   └── StructureInfoPanel.tsx
    ├── lib/
    │   ├── structure.ts               PDB / mmCIF summary parser (info panel)
    │   ├── rcsb.ts                    PDB ID validation + download
    │   ├── samples.ts                 sample catalogue + lazy loading
    │   ├── styles.ts                  UI choices + palettes -> 3Dmol style steps
    │   └── theme.ts                   light / dark theme + persistence
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

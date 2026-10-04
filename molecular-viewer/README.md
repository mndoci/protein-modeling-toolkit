# molecular-viewer

An interactive 3D protein structure viewer that runs in the browser. Part of the
[protein-modeling-toolkit](../) (sibling of `secondary-structure-analysis/`).

Built with React + Vite + TypeScript; rendering is done by
[3Dmol.js](https://3dmol.org/) (WebGL).

**Live demo:** <https://main.d162l9aqc0o2mt.amplifyapp.com/> (hosted on AWS
Amplify, rebuilt automatically on every push to `main`).

## Features

- **Layout:** a slim top bar (sample menu, PDB ID search, **Open file**, light/dark toggle) and a full-window 3D view. An info card, a toolbar, a colour legend and a display bar float over the molecule.
- **Load a structure** four ways:
  - pick one of **8 bundled samples** from the **Sample** menu in the top bar; each has a preview image and a one-line description, and loads as soon as you pick it (works offline),
  - type a 4-character PDB ID (e.g. `1UBQ`) to download it from [RCSB](https://www.rcsb.org/),
  - **Open file**, or drop a `.pdb` / `.ent` / `.cif` / `.mmcif` file anywhere on the page. The file is read in the browser and never uploaded.
  - open a shared link (see below).
- **Info card:** name and description, plus chips for chains, residues, atoms, each ligand (e.g. `4 × HEM`), waters and file format.
- **Legend:** explains the current colours: chains (with residue counts), helix/sheet/coil, or the N-to-C rainbow, plus the ligand element colours.
- **Hover labels:** point at the molecule to see e.g. `Chain A · HIS 87 · α-helix` or `Chain C · HEM 142 · ligand · atom FE`.
- **Display bar:** one-click **Style** (Cartoon, Stick, Sphere, Line, Surface) and **Color** (Chain, Structure, Rainbow) buttons, and **Ligands** / **Water** switches.
- **Surface style:** a translucent molecular surface over the cartoon, in the active colours. Ligands stay visible as sticks inside their pockets.
- **Toolbar:** Reset view, Save image (PNG), Copy share link, Full screen (where the browser supports it).
- **Share links:** the link encodes the structure and display, e.g. `?sample=4HHB&style=surface&color=chain` or `?pdb=1UBQ`. Files opened from your computer cannot be shared by link. Unknown or malformed values in a link are ignored.
- **Dark mode:** the sun/moon button. It starts from your operating-system setting, remembers your choice, and recolours the 3D background too.
- **Polished cartoon:** round coils, arrowheads showing β-strand direction, smoother curves and a thin outline. Ligands use grey carbons with red oxygen and blue nitrogen.
- **Phones:** the top bar wraps, the display bar scrolls sideways, and the legend shrinks.
- **Keyboard accessible:** the sample menu follows the standard listbox keys (arrows, Home/End, Enter, Escape), the style and colour groups are radio groups, focus outlines are shown, and errors and loading are announced to screen readers.
- Rotate (drag), zoom (scroll), pan (right-drag).

## Sample structures

Each sample opens with the view that shows it off best. The PDB files are in
`src/assets/samples/` (preview images in `src/assets/thumbs/`; public-domain data from the [RCSB PDB](https://www.rcsb.org/))
and are loaded on demand, so they add nothing to the first page load.

| ID | Structure | What it shows off |
| --- | --- | --- |
| 1CRN | Crambin | Smallest sample: two helices and a short β-sheet |
| 1UBQ | Ubiquitin | α/β fold with β-strand arrowheads |
| 1MBN | Myoglobin | All-helical protein, spectrum colouring, heme ligand |
| 4HHB | Hemoglobin | Four chains coloured by chain, four hemes |
| 1EMA | GFP (green fluorescent protein) | β-barrel around a chromophore |
| 1TIM | TIM (triose phosphate isomerase) | Two-subunit TIM barrel, spectrum colouring |
| 1HSG | HIV-1 protease | Drug target with a bound inhibitor |
| 1BNA | B-DNA | A nucleic acid: double helix with base pairs |

## Requirements

- Node.js **22.12 or newer** (npm 10+)
- A browser with WebGL (any current Chrome, Firefox, Safari or Edge)

## Install and run

```bash
cd molecular-viewer
npm ci            # installs the exact versions in package-lock.json
npm run dev       # dev server at http://localhost:5173
```

Then pick a sample from the **Sample** menu, or enter a PDB ID and press **Fetch**.

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
  counts taken straight from its PDB file, plus its ligands and waters.
- **RCSB fetching:** ID validation, the download URL, 404 / HTTP / network errors.
- **Style mapping** for all 15 style x color combinations, the colour palettes
  (including the arrowhead fix and the rainbow gradient), ligand element colours,
  the ligand / water / DNA-base layers, and the surface.
- **Hover labels** and **share links** (round trip, and rejection of bad values).
- **Theme:** OS preference, saved choice, corrupt or blocked storage.
- **The app UI** via React Testing Library: loading samples (and that each
  applies its own view), the sample menu by mouse and keyboard, fetching by ID,
  uploading and dropping files, the 50 MB limit, switching style/color/ligands/water
  without reloading, the legend, hover labels, the surface, reset view, saving an
  image, copying a share link, full screen, opening shared links, dark mode,
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
    ├── App.tsx                        top bar, stage, toolbar, loading + drag-and-drop
    ├── styles.css
    ├── assets/samples/*.pdb           the 8 bundled sample structures
    ├── assets/thumbs/*.jpg            sample preview images for the menu
    ├── components/
    │   ├── MoleculeViewer.tsx         React wrapper around 3Dmol.js (hover, surface, snapshot)
    │   ├── SamplePicker.tsx           the Sample menu (listbox)
    │   ├── InfoCard.tsx / Legend.tsx  floating cards over the viewer
    │   ├── DisplayBar.tsx             style / colour buttons + switches
    │   └── Icons.tsx
    ├── lib/
    │   ├── structure.ts               PDB / mmCIF summary parser (info card)
    │   ├── hover.ts                   hover label text
    │   ├── share.ts                   share-link encode / decode
    │   ├── rcsb.ts                    PDB ID validation + download
    │   ├── samples.ts                 sample catalogue + lazy loading
    │   ├── styles.ts                  UI choices + palettes -> 3Dmol style steps
    │   └── theme.ts                   light / dark theme + persistence
    └── test/                          Vitest setup + 3Dmol fake
```

## Notes

- The info card counts **polymer** residues (ATOM records) and reports
  ligands and waters separately. For multi-model files (NMR
  ensembles) only the first model is counted.
- Fetch by ID downloads the PDB-format file. Very large entries that RCSB only
  publishes as mmCIF will show a "not available" message; download the `.cif`
  from RCSB and upload it instead.
- `npm run build` prints an `[EVAL]` warning. It comes from inside 3Dmol.js
  (its optional string-callback feature) and is not used by this app.
- Coloring by secondary structure uses the HELIX/SHEET records in the file when
  present; otherwise 3Dmol.js computes them itself.

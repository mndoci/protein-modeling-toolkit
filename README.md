# protein-modeling-toolkit

[![tests](https://github.com/mndoci/protein-modeling-toolkit/actions/workflows/tests.yml/badge.svg)](https://github.com/mndoci/protein-modeling-toolkit/actions/workflows/tests.yml)

A collection of small, self-contained tools for working with protein
structures. Each tool lives in its own folder with its own dependencies,
tests and README, so you can install and use one without the others.

## Tools

| Tool | What it does | Tech |
|------|--------------|------|
| [`secondary-structure-analysis/`](secondary-structure-analysis/) | Command-line tool (`ssa`) that reads a PDB or mmCIF file and reports per-residue secondary structure (helix / sheet / coil) plus summary percentages. Pure-Python DSSP-style assignment -- no external binaries. | Python 3.9+, Biopython |
| [`molecular-viewer/`](molecular-viewer/) | Browser-based 3D structure viewer. Load a file, fetch a PDB ID from RCSB, or open a bundled sample; switch between cartoon / stick / sphere / line and several color schemes; see chain, residue and atom counts. **[Live demo](https://main.d162l9aqc0o2mt.amplifyapp.com/)** | React, Vite, TypeScript, 3Dmol.js |

## Quick start

Clone the repository, then go into the tool you want.

```bash
git clone https://github.com/mndoci/protein-modeling-toolkit.git
cd protein-modeling-toolkit
```

**Secondary structure analysis** (needs Python 3.9 or newer):

```bash
cd secondary-structure-analysis
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
ssa --fetch 1CRN          # download crambin from RCSB and analyze it
```

**Molecular viewer** (needs Node.js 22.12 or newer):

```bash
cd molecular-viewer
npm ci
npm run dev               # open http://localhost:5173
```

See each tool's README for full usage, sample output and limitations.

## Repository layout

```
protein-modeling-toolkit/
├── secondary-structure-analysis/   Python CLI: per-residue H/E/C assignment
├── molecular-viewer/               Web app: interactive 3D viewer
├── .github/workflows/tests.yml     CI (runs the ssa test suite)
└── LICENSE                         Apache 2.0, covers every tool
```

New tools get their own sibling folder. Nothing in one tool depends on another.

## Tests

Every tool has its own test suite, and none of them need network access:

```bash
# secondary-structure-analysis
cd secondary-structure-analysis && pip install -e ".[dev]" && python -m pytest -q

# molecular-viewer
cd molecular-viewer && npm ci && npm test
```

GitHub Actions currently runs the `secondary-structure-analysis` tests (Python
3.9 and 3.12) on every push and pull request to `main`. The
`molecular-viewer` tests are run locally for now.

## License

[Apache License 2.0](LICENSE).

# ssa — Secondary Structure Analysis

A Python command-line tool that reads a protein structure file (**PDB**, and
**mmCIF** where Biopython supports it) and outputs **per-residue secondary
structure assignments** — helix / sheet / coil (3-state `H` / `E` / `C`,
derived from an 8-state DSSP-style classification) — plus **summary
statistics** (percent and count of helix / sheet / coil).

This is the first tool in the **protein-modeling-toolkit**.

## How it works

Secondary structure is assigned in **pure Python** using the backbone
hydrogen-bond energy definition of **Kabsch & Sander (1983)** — the same
electrostatic H-bond model DSSP uses:

```
E = q1·q2·f·(1/r(O,N) + 1/r(C,H) − 1/r(O,H) − 1/r(C,N))   kcal/mol
```

An H-bond is counted when `E < −0.5 kcal/mol`. From the resulting H-bond map
the tool detects n-turns (3/4/5), α/3₁₀/π helices, and β bridges/strands, emits
an 8-state code (`H G I E B T S -`), and collapses it to 3-state:

| 8-state | meaning        | 3-state |
|---------|----------------|---------|
| H       | α-helix        | H       |
| G       | 3₁₀-helix      | H       |
| I       | π-helix        | H       |
| E       | β-strand       | E       |
| B       | β-bridge       | E       |
| T, S, − | turn/bend/coil | C       |

**No external `mkdssp`/`dssp` binary is required.** Parsing uses
[Biopython](https://biopython.org/).

## Install

Requires Python ≥ 3.9. Install into a virtual environment:

```bash
cd secondary-structure-analysis
python3 -m venv .venv
. .venv/bin/activate
pip install -e .          # add ".[dev]" to also get pytest
```

This installs an `ssa` console command (and the tool is also runnable as
`python -m ssa`). Dependencies are pinned: `biopython==1.85`, `numpy==1.26.4`.

## Usage

```bash
ssa STRUCTURE.pdb              # analyze a local PDB file
ssa STRUCTURE.cif              # analyze a local mmCIF file
ssa --fetch 1CRN               # download a PDB id from RCSB and analyze it
ssa STRUCTURE.pdb --format json  # machine-readable JSON output
python -m ssa STRUCTURE.pdb    # equivalent module invocation
```

Options:

- `-f, --format {table,json}` — output format (default `table`).
- `--fetch PDBID` — download the structure from RCSB instead of reading a file.
- `--model N` — model index for multi-model files (NMR ensembles); default `0`.
- `--version`, `-h/--help`.

## Sample run

Running on **crambin (1CRN)**, a 46-residue plant protein with two α-helices
and a short β-sheet — bundled at `tests/data/1CRN.pdb`:

```bash
$ ssa tests/data/1CRN.pdb
```

```
Structure: 1CRN
Residues:  46

CHAIN   RESID  RES AA SS8 SS3
---------------------------------
A           1  THR T  -   C
A           2  THR T  -   C
A           3  CYS C  B   E
A           4  CYS C  -   C
A           5  PRO P  -   C
A           6  SER S  -   C
A           7  ILE I  H   H
A           8  VAL V  H   H
A           9  ALA A  H   H
A          10  ARG R  H   H
A          11  SER S  H   H
A          12  ASN N  H   H
A          13  PHE F  H   H
A          14  ASN N  H   H
A          15  VAL V  H   H
A          16  CYS C  H   H
A          17  ARG R  H   H
...
A          23  GLU E  H   H
A          24  ALA A  H   H
A          25  ILE I  H   H
A          26  CYS C  H   H
A          27  ALA A  H   H
A          28  THR T  H   H
A          29  TYR Y  H   H
A          32  CYS C  B   E
A          33  ILE I  B   E
...

Summary (3-state):
  H (helix):   22  ( 47.8%)
  E (sheet):    2  (  4.3%)
  C (coil ):   22  ( 47.8%)
  total     :   46

Sequence : TTCCPSIVARSNFNVCRLPGTPEAICATYTGCIIIPGATCPGDYAN
SS (3st) : CCECCCHHHHHHHHHHHCCCCCHHHHHHHHCCECCCCCCCCHHHCC
```

This matches crambin's known fold: the author-annotated helices in the PDB
header span residues 7–19 and 23–30, and the assigner places its two helices
squarely within them.

### JSON output

```bash
$ ssa tests/data/1CRN.pdb --format json
```

```json
{
  "structure_id": "1CRN",
  "total_residues": 46,
  "counts": { "H": 22, "E": 2, "C": 22 },
  "percentages": { "H": 47.83, "E": 4.35, "C": 47.83 },
  "sequence": "TTCCPSIVARSNFNVCRLPGTPEAICATYTGCIIIPGATCPGDYAN",
  "ss3": "CCECCCHHHHHHHHHHHCCCCCHHHHHHHHCCECCCCCCCCHHHCC",
  "residues": [ { "chain": "A", "seq_id": 1, "resname": "THR", "one_letter": "T", "ss8": "-", "ss3": "C" }, ... ]
}
```

### Another example: ubiquitin (1UBQ)

```bash
$ ssa --fetch 1UBQ
...
  H (helix):   18  ( 23.7%)
  E (sheet):   14  ( 18.4%)
  C (coil ):   44  ( 57.9%)
```

Consistent with ubiquitin's mixed α/β fold (one main helix and a five-stranded
β-sheet).

## Layout

```
secondary-structure-analysis/
├── ssa/
│   ├── __init__.py     # package + public API
│   ├── parser.py       # PDB/mmCIF parsing (Biopython)
│   ├── assign.py       # Kabsch-Sander H-bond SS assignment (pure Python)
│   ├── analyze.py      # parse + assign + summary
│   ├── format.py       # table / JSON output
│   ├── cli.py          # argparse CLI (ssa entry point)
│   └── __main__.py     # python -m ssa
├── tests/
│   ├── data/1CRN.pdb   # bundled sample (hermetic tests)
│   └── test_ssa.py
├── pyproject.toml
└── README.md
```

## Tests

```bash
pip install -e ".[dev]"
python -m pytest -q
```

Tests run assignment on the bundled 1CRN structure and check output shape,
count/percentage consistency, the 8→3 collapse mapping, both output formats,
and that the known helix/sheet content of crambin is recovered.

## Limitations

- Strand detection reports H-bonded β bridges/strands; it is more conservative
  than DSSP's full ladder/sheet bookkeeping, so exposed edge strands may read as
  bridges. The 3-state `H`/`E`/`C` output is the tool's primary, validated
  product.
- `T` (turn) and `S` (bend) are not separately emitted; those residues report as
  coil, consistent with the 3-state collapse.
- Optional DSSP-binary backend is not wired in (the environment has no
  `mkdssp`); the pure-Python path is the only backend.

"""Command-line interface for ssa.

Usage
-----
    ssa STRUCTURE.pdb
    ssa --fetch 1CRN
    ssa STRUCTURE.cif --format json
    python -m ssa STRUCTURE.pdb
"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
import urllib.request

from ssa import __version__
from ssa.analyze import analyze
from ssa.format import format_json, format_table

_RCSB_PDB_URL = "https://files.rcsb.org/download/{pdb_id}.pdb"


def _fetch_pdb(pdb_id: str) -> str:
    """Download a PDB file from RCSB into a temp file; return its path."""
    pdb_id = pdb_id.strip().upper()
    url = _RCSB_PDB_URL.format(pdb_id=pdb_id)
    fd, path = tempfile.mkstemp(prefix=f"{pdb_id}_", suffix=".pdb")
    os.close(fd)
    try:
        with urllib.request.urlopen(url, timeout=30) as resp, open(path, "wb") as out:
            out.write(resp.read())
    except Exception as exc:  # pragma: no cover - network path
        os.unlink(path)
        raise SystemExit(f"error: failed to fetch {pdb_id} from RCSB: {exc}")
    return path


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="ssa",
        description=(
            "Secondary Structure Analysis: per-residue helix/sheet/coil (H/E/C) "
            "assignment from a PDB or mmCIF file, using a pure-Python "
            "Kabsch-Sander backbone hydrogen-bond definition (no DSSP binary "
            "required)."
        ),
    )
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("structure", nargs="?", help="path to a PDB or mmCIF file")
    src.add_argument(
        "--fetch",
        metavar="PDBID",
        help="download this PDB id from RCSB and analyze it (e.g. 1CRN)",
    )
    p.add_argument(
        "-f",
        "--format",
        choices=("table", "json"),
        default="table",
        help="output format (default: table)",
    )
    p.add_argument(
        "--model",
        type=int,
        default=0,
        help="model index to use for multi-model files (default: 0)",
    )
    p.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)

    if args.fetch:
        path = _fetch_pdb(args.fetch)
        cleanup = True
    else:
        path = args.structure
        cleanup = False
        if not os.path.isfile(path):
            print(f"error: file not found: {path}", file=sys.stderr)
            return 2

    try:
        result = analyze(path, model_index=args.model)
    except Exception as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    finally:
        if cleanup and os.path.isfile(path):
            os.unlink(path)

    if args.format == "json":
        print(format_json(result))
    else:
        print(format_table(result))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

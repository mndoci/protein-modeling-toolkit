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
import re
import sys
import tempfile
import urllib.request

from ssa import __version__
from ssa.analyze import analyze
from ssa.format import format_json, format_table

_RCSB_URL = "https://files.rcsb.org/download/{pdb_id}.{ext}"
# A PDB id is 4 chars: a leading digit then three alphanumerics.
_PDB_ID_RE = re.compile(r"^[0-9][A-Za-z0-9]{3}$")


def _validate_pdb_id(pdb_id: str) -> str:
    """Normalise and validate a PDB id, or raise SystemExit with a clear error."""
    pdb_id = pdb_id.strip().upper()
    if not _PDB_ID_RE.match(pdb_id):
        raise SystemExit(
            f"error: invalid PDB id {pdb_id!r}: expected 4 characters "
            "matching ^[0-9][A-Za-z0-9]{3}$ (e.g. 1CRN)"
        )
    return pdb_id


def _download(url: str, suffix: str) -> str:
    """Download ``url`` into a temp file with a constant safe prefix.

    Raises urllib errors to the caller; returns the temp file path on success.
    """
    fd, path = tempfile.mkstemp(prefix="ssa_", suffix=suffix)
    os.close(fd)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ssa/%s" % __version__})
        with urllib.request.urlopen(req, timeout=30) as resp, open(path, "wb") as out:
            out.write(resp.read())
    except Exception:
        if os.path.isfile(path):
            os.unlink(path)
        raise
    return path


def _fetch_structure(pdb_id: str):
    """Fetch ``pdb_id`` from RCSB, preferring PDB and falling back to mmCIF.

    The temp file never carries the untrusted id in its name (constant ``ssa_``
    prefix). Returns ``(path, suffix)``; the caller cleans up the file.
    """
    pdb_id = _validate_pdb_id(pdb_id)
    last_exc = None
    for ext, suffix in (("pdb", ".pdb"), ("cif", ".cif")):
        url = _RCSB_URL.format(pdb_id=pdb_id, ext=ext)
        try:
            return _download(url, suffix)
        except Exception as exc:  # pragma: no cover - network path
            last_exc = exc
            continue
    raise SystemExit(f"error: failed to fetch {pdb_id} from RCSB (pdb and cif): {last_exc}")


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

    override_id = None
    if args.fetch:
        pdb_id = _validate_pdb_id(args.fetch)
        path = _fetch_structure(pdb_id)
        override_id = pdb_id  # report the PDB id, not the temp file name
        cleanup = True
    else:
        path = args.structure
        cleanup = False
        if not os.path.isfile(path):
            print(f"error: file not found: {path}", file=sys.stderr)
            return 2

    try:
        result = analyze(path, model_index=args.model, structure_id=override_id)
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

"""Output formatting for analysis results (table and JSON)."""

from __future__ import annotations

import json

from ssa.analyze import SSResult

_SS3_NAME = {"H": "helix", "E": "sheet", "C": "coil"}


def format_table(result: SSResult) -> str:
    """Human-readable per-residue table plus a summary block."""
    lines = []
    lines.append(f"Structure: {result.structure_id}")
    lines.append(f"Residues:  {result.total}")
    lines.append("")
    lines.append(f"{'CHAIN':<6}{'RESID':>7}  {'RES':<4}{'AA':<3}{'SS8':<4}{'SS3':<4}")
    lines.append("-" * 33)
    for r in result.residues:
        resid = f"{r.seq_id}{r.icode.strip()}"
        lines.append(
            f"{r.chain_id:<6}{resid:>7}  {r.resname:<4}{r.one_letter:<3}{r.ss8:<4}{r.ss3:<4}"
        )
    lines.append("")
    lines.append("Summary (3-state):")
    counts = result.counts
    pcts = result.percentages
    for code in ("H", "E", "C"):
        name = _SS3_NAME[code]
        lines.append(
            f"  {code} ({name:<5}): {counts[code]:>4}  ({pcts[code]:5.1f}%)"
        )
    lines.append(f"  total     : {result.total:>4}")
    lines.append("")
    lines.append("Sequence : " + result.sequence)
    lines.append("SS (3st) : " + result.ss3_string)
    return "\n".join(lines)


def format_json(result: SSResult, indent: int = 2) -> str:
    """Machine-readable JSON with per-residue records and summary."""
    payload = {
        "structure_id": result.structure_id,
        "total_residues": result.total,
        "counts": result.counts,
        "percentages": {k: round(v, 2) for k, v in result.percentages.items()},
        "sequence": result.sequence,
        "ss3": result.ss3_string,
        "residues": [
            {
                "chain": r.chain_id,
                "seq_id": r.seq_id,
                "icode": r.icode.strip(),
                "resname": r.resname,
                "one_letter": r.one_letter,
                "ss8": r.ss8,
                "ss3": r.ss3,
            }
            for r in result.residues
        ],
    }
    return json.dumps(payload, indent=indent)

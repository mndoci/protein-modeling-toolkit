"""High-level analysis: parse + assign + summarize.

:func:`analyze` is the one-call entry point used by the CLI and tests.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

from ssa.assign import assign_secondary_structure, collapse_8_to_3
from ssa.parser import load_structure


@dataclass
class ResidueSS:
    """Per-residue secondary-structure record."""

    chain_id: str
    seq_id: int
    icode: str
    resname: str
    one_letter: str
    ss8: str  # DSSP 8-state code (H G I E B T S -)
    ss3: str  # collapsed 3-state code (H E C)

    @property
    def label(self) -> str:
        ic = self.icode.strip()
        return f"{self.chain_id}:{self.seq_id}{ic}"


@dataclass
class SSResult:
    """Full result for one structure."""

    structure_id: str
    residues: List[ResidueSS] = field(default_factory=list)

    @property
    def counts(self) -> Dict[str, int]:
        c = {"H": 0, "E": 0, "C": 0}
        for r in self.residues:
            c[r.ss3] += 1
        return c

    @property
    def total(self) -> int:
        return len(self.residues)

    @property
    def percentages(self) -> Dict[str, float]:
        total = self.total or 1
        return {k: 100.0 * v / total for k, v in self.counts.items()}

    @property
    def sequence(self) -> str:
        return "".join(r.one_letter for r in self.residues)

    @property
    def ss3_string(self) -> str:
        return "".join(r.ss3 for r in self.residues)


def analyze(path: str, model_index: int = 0) -> SSResult:
    """Parse ``path``, assign secondary structure, and return an SSResult."""
    structure = load_structure(path, model_index=model_index)
    codes8 = assign_secondary_structure(structure)
    residues = structure.residues
    result = SSResult(structure_id=structure.structure_id)
    for res, code8 in zip(residues, codes8):
        result.residues.append(
            ResidueSS(
                chain_id=res.chain_id,
                seq_id=res.seq_id,
                icode=res.icode,
                resname=res.resname,
                one_letter=res.one_letter,
                ss8=code8,
                ss3=collapse_8_to_3(code8),
            )
        )
    return result

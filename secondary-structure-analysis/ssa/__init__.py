"""ssa -- Secondary Structure Analysis.

A pure-Python command-line tool that reads a protein structure file
(PDB, and mmCIF where Biopython supports it) and produces per-residue
secondary-structure assignments (3-state H / E / C, derived from an
8-state DSSP-style classification) plus summary statistics.

The secondary-structure assignment is implemented in pure Python using
the Kabsch & Sander (1983) backbone hydrogen-bond energy definition, so
the tool has NO dependency on an external ``mkdssp``/``dssp`` binary.

Public API
----------
- :func:`ssa.parser.load_structure` -- parse a structure file into chains.
- :func:`ssa.assign.assign_secondary_structure` -- assign SS to residues.
- :func:`ssa.analyze.analyze` -- one-call parse + assign + summarize.
"""

from ssa.analyze import ResidueSS, SSResult, analyze
from ssa.assign import assign_secondary_structure, collapse_8_to_3

__version__ = "0.1.0"

__all__ = [
    "analyze",
    "assign_secondary_structure",
    "collapse_8_to_3",
    "ResidueSS",
    "SSResult",
    "__version__",
]

"""Pure-Python secondary-structure assignment.

Implements the backbone hydrogen-bond definition of Kabsch & Sander
(1983), "Dictionary of protein secondary structure", Biopolymers 22:2577.
This is the same energy model DSSP uses, computed here without any
external binary.

The classifier produces an 8-state code per residue, which is then
collapsed to the common 3-state alphabet:

    8-state          3-state
    H (alpha helix)   H
    G (3-10 helix)    H
    I (pi helix)      H
    E (beta strand)   E
    B (beta bridge)   E
    T (turn)          C
    S (bend)          C
    - (coil/loop)     C

Only H-bond-derived helices and strands are assigned here (H, G, I, E, B);
T, S are not separately detected, so unassigned residues are reported as
coil ('-'), which collapses to 'C'. This keeps the 3-state H/E/C output --
the tool's primary product -- faithful to the DSSP definition.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Tuple

from ssa.parser import Residue, Structure

Vec = Tuple[float, float, float]

# Kabsch-Sander electrostatic H-bond energy constants.
_Q1 = 0.42
_Q2 = 0.20
_F = 332.0
# Energy threshold (kcal/mol) below which an H-bond is considered to exist.
_HBOND_ENERGY_CUTOFF = -0.5
# Minimum N..O distance (A) guarding against division blow-ups / bad geometry.
_MIN_DIST = 0.5

# Map 8-state -> 3-state.
_EIGHT_TO_THREE = {
    "H": "H", "G": "H", "I": "H",
    "E": "E", "B": "E",
    "T": "C", "S": "C", "-": "C",
}


def collapse_8_to_3(code: str) -> str:
    """Collapse a single DSSP 8-state code to 3-state H/E/C."""
    return _EIGHT_TO_THREE.get(code, "C")


def _sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _norm(a: Vec) -> float:
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def _dist(a: Vec, b: Vec) -> float:
    return _norm(_sub(a, b))


def _estimate_H(res: Residue, prev: Optional[Residue]) -> Optional[Vec]:
    """Estimate the amide-hydrogen position for ``res``.

    DSSP places H at N plus the unit vector along (C_prev -> O_prev),
    1.0 A from N. Proline has no amide H, and the first residue of a
    chain has no preceding C=O, so both return None (no donor).
    """
    if res.resname == "PRO":
        return None
    if prev is None or prev.C is None or prev.O is None or res.N is None:
        return None
    co = _sub(prev.O, prev.C)
    length = _norm(co)
    if length < _MIN_DIST:
        return None
    unit = (co[0] / length, co[1] / length, co[2] / length)
    return (res.N[0] - unit[0], res.N[1] - unit[1], res.N[2] - unit[2])


def _hbond_energy(donor: Residue, donor_H: Optional[Vec], acceptor: Residue) -> Optional[float]:
    """Electrostatic H-bond energy between donor N-H and acceptor C=O.

    Returns the energy in kcal/mol, or None if geometry is unusable.
    """
    if donor_H is None:
        return None
    if donor.N is None or acceptor.C is None or acceptor.O is None:
        return None
    r_ON = _dist(acceptor.O, donor.N)
    r_CH = _dist(acceptor.C, donor_H)
    r_OH = _dist(acceptor.O, donor_H)
    r_CN = _dist(acceptor.C, donor.N)
    if min(r_ON, r_CH, r_OH, r_CN) < _MIN_DIST:
        return None
    return _Q1 * _Q2 * _F * (1.0 / r_ON + 1.0 / r_CH - 1.0 / r_OH - 1.0 / r_CN)


def _build_hbond_map(residues: List[Residue]) -> Dict[int, List[int]]:
    """For each residue index i, list acceptor indices j it H-bonds TO.

    i is the donor (N-H), j is the acceptor (C=O). An H-bond exists when
    the Kabsch-Sander energy is below the cutoff.
    """
    n = len(residues)
    # Precompute estimated amide H for each residue.
    hydrogens: List[Optional[Vec]] = [None] * n
    for i in range(n):
        prev = residues[i - 1] if i > 0 and residues[i - 1].chain_id == residues[i].chain_id else None
        hydrogens[i] = _estimate_H(residues[i], prev)

    bonds: Dict[int, List[int]] = {i: [] for i in range(n)}
    # CA-CA distance pre-filter: an H-bond can't span more than ~9 A between CAs.
    for i in range(n):
        di = residues[i]
        if di.CA is None:
            continue
        for j in range(n):
            if abs(i - j) < 1:
                continue
            aj = residues[j]
            if aj.CA is None:
                continue
            if _dist(di.CA, aj.CA) > 9.0:
                continue
            energy = _hbond_energy(di, hydrogens[i], aj)
            if energy is not None and energy < _HBOND_ENERGY_CUTOFF:
                bonds[i].append(j)
    return bonds


def _has_bond(bonds: Dict[int, List[int]], donor: int, acceptor: int) -> bool:
    return acceptor in bonds.get(donor, ())


def assign_secondary_structure(structure: Structure) -> List[str]:
    """Assign an 8-state code to each residue of ``structure``.

    Residues are taken in chain order (the same order as
    ``structure.residues``). Returns a list of single-character 8-state
    codes aligned to that residue list.
    """
    residues = structure.residues
    n = len(residues)
    codes = ["-"] * n
    if n == 0:
        return codes

    bonds = _build_hbond_map(residues)

    # Index ranges are per-chain: never let n-turns cross a chain break.
    same_chain = [
        residues[i].chain_id == residues[i - 1].chain_id if i > 0 else False
        for i in range(n)
    ]

    def contiguous(i: int, j: int) -> bool:
        """True if i..j lie in one unbroken chain segment."""
        if j < 0 or j >= n or i < 0 or i >= n:
            return False
        lo, hi = (i, j) if i <= j else (j, i)
        for k in range(lo + 1, hi + 1):
            if not same_chain[k]:
                return False
        return True

    # --- n-turns (n = 3,4,5) ---
    # An n-turn at residue i means the C=O of residue i is H-bonded to the
    # N-H of residue i+n. In our donor->acceptor bond map that is a bond
    # FROM the donor (i+n) TO the acceptor (i): _has_bond(bonds, i+n, i).
    turn3 = [False] * n
    turn4 = [False] * n
    turn5 = [False] * n
    for i in range(n):
        for nturn, flags in ((3, turn3), (4, turn4), (5, turn5)):
            j = i + nturn
            if contiguous(i, j) and _has_bond(bonds, j, i):
                flags[i] = True

    # --- Helices: two consecutive n-turns of the same type form a helix ---
    # A helix of type n covers the residues bracketed by two overlapping
    # n-turns starting at i-1 and i: the H-bonded core i .. i+n-1.
    # 4-turn -> alpha (H), 3-turn -> 3-10 (G), 5-turn -> pi (I).
    def mark_helix(turn_flags, nturn, code):
        for i in range(1, n):
            if turn_flags[i] and turn_flags[i - 1] and contiguous(i - 1, i + nturn - 1):
                for k in range(i, i + nturn):
                    if 0 <= k < n and codes[k] == "-":
                        codes[k] = code

    mark_helix(turn4, 4, "H")
    mark_helix(turn3, 3, "G")
    mark_helix(turn5, 5, "I")

    # --- Beta bridges & strands ---
    # Parallel bridge between i and j:  (i-1 -> j and j -> i+1) OR (j-1 -> i and i -> j+1)
    # Antiparallel bridge between i and j: (i -> j and j -> i) OR (i-1 -> j+1 and j-1 -> i+1)
    bridge = [False] * n
    bridge_partner: Dict[int, List[int]] = {i: [] for i in range(n)}
    for i in range(1, n - 1):
        for j in range(1, n - 1):
            if abs(i - j) < 3:  # bridges are between residues far apart in sequence
                continue
            if not contiguous(i - 1, i + 1) or not contiguous(j - 1, j + 1):
                continue
            parallel = (
                (_has_bond(bonds, i - 1, j) and _has_bond(bonds, j, i + 1))
                or (_has_bond(bonds, j - 1, i) and _has_bond(bonds, i, j + 1))
            )
            antiparallel = (
                (_has_bond(bonds, i, j) and _has_bond(bonds, j, i))
                or (_has_bond(bonds, i - 1, j + 1) and _has_bond(bonds, j - 1, i + 1))
            )
            if parallel or antiparallel:
                bridge[i] = True
                bridge_partner[i].append(j)

    # A residue in >=2 consecutive bridges is a strand (E); an isolated
    # bridge is B. Both collapse to E in 3-state.
    for i in range(n):
        if not bridge[i]:
            continue
        extended = (
            (i + 1 < n and bridge[i + 1] and contiguous(i, i + 1))
            or (i - 1 >= 0 and bridge[i - 1] and contiguous(i - 1, i))
        )
        code = "E" if extended else "B"
        # Strands/bridges do not overwrite an already-assigned helix.
        if codes[i] == "-":
            codes[i] = code

    return codes

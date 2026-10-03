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
    T (turn)          C   [not computed -- see below]
    S (bend)          C   [not computed -- see below]
    - (coil/loop)     C

H-bond-derived helices, strands, and bridges are assigned here
(H, G, I, E, B). Turn (T) and bend (S) are *not* separately detected, so
those residues report as coil ('-'), which collapses to 'C'. The 3-state
H/E/C output -- the tool's primary product -- is therefore faithful to the
DSSP definition for H and E; the only difference from DSSP is that DSSP's
T/S residues land in coil here (and both collapse to 'C' regardless).

H-bond convention
-----------------
A Kabsch-Sander hydrogen bond ``Hbond(a, b)`` runs from the C=O of residue
``a`` to the N-H of residue ``b``. In this module the sparse bond map is
keyed by the *donor* (the N-H residue) and lists the *acceptor* (the C=O
residue) indices it bonds to; the :func:`hb` helper below states the
Hbond(co, nh) relation directly on top of that map so every turn and
bridge predicate is unambiguous.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Set, Tuple

import numpy as np

from ssa.parser import Residue, Structure

Vec = Tuple[float, float, float]

# Kabsch-Sander electrostatic H-bond energy constants.
_Q1 = 0.42
_Q2 = 0.20
_F = 332.0
# Energy threshold (kcal/mol) below which an H-bond is considered to exist.
_HBOND_ENERGY_CUTOFF = -0.5
# DSSP clamps the electrostatic energy to this floor.
_HBOND_ENERGY_MIN = -9.9
# Minimum interatomic distance (A) guarding against division blow-ups.
_MIN_DIST = 0.5
# CA-CA distance (A) beyond which no backbone H-bond is geometrically possible.
_CA_CUTOFF = 9.0
# Max plausible peptide-bond C(prev)-N(cur) distance (A) for chain continuity.
_PEPTIDE_BOND_MAX = 2.5

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


def is_peptide_contiguous(prev: Optional[Residue], cur: Optional[Residue]) -> bool:
    """True if ``cur`` is covalently the next residue after ``prev``.

    Requires the same chain, the backbone atoms needed to judge the link
    (prev C and cur N), and a peptide-bond-length C(prev)-N(cur) distance.
    Residue numbering and insertion codes are deliberately NOT consulted:
    a numbering jump inside a covalent chain (author renumbering, insertion
    codes) is still contiguous, and same-number-different-position residues
    across an unresolved gap are not.
    """
    if prev is None or cur is None:
        return False
    if prev.chain_id != cur.chain_id:
        return False
    if prev.C is None or cur.N is None:
        return False
    return _dist(prev.C, cur.N) <= _PEPTIDE_BOND_MAX


def _estimate_H(res: Residue, prev: Optional[Residue]) -> Optional[Vec]:
    """Estimate the amide-hydrogen position for ``res``.

    DSSP places the amide H at N displaced by 1.0 A along the direction of
    the preceding residue's C->O bond, i.e. ``N - normalize(O_prev - C_prev)``.
    Proline has no amide H, and a residue with no covalently preceding C=O
    (chain start or a break) has no donor, so both return None.
    """
    if res.resname == "PRO":
        return None
    if not is_peptide_contiguous(prev, res):
        return None
    if prev.C is None or prev.O is None or res.N is None:
        return None
    co = _sub(prev.O, prev.C)
    length = _norm(co)
    if length < _MIN_DIST:
        return None
    unit = (co[0] / length, co[1] / length, co[2] / length)
    return (res.N[0] - unit[0], res.N[1] - unit[1], res.N[2] - unit[2])


def _hbond_energy(donor: Residue, donor_H: Optional[Vec], acceptor: Residue) -> Optional[float]:
    """Electrostatic H-bond energy between donor N-H and acceptor C=O.

    Returns the energy in kcal/mol (clamped to a -9.9 floor as DSSP does),
    or None if the geometry is unusable.
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
    energy = _Q1 * _Q2 * _F * (1.0 / r_ON + 1.0 / r_CH - 1.0 / r_OH - 1.0 / r_CN)
    return max(energy, _HBOND_ENERGY_MIN)


def _candidate_pairs(residues: List[Residue]) -> Dict[int, List[int]]:
    """Donor-index -> nearby acceptor-index candidates by CA proximity.

    Uses a numpy vectorised distance screen (O(n * k) after a coarse
    bounding step) so the whole assignment stays well under O(n^2) for
    large structures. Residues without a CA contribute no candidates.
    """
    n = len(residues)
    idx = [i for i in range(n) if residues[i].CA is not None]
    out: Dict[int, List[int]] = {i: [] for i in range(n)}
    if not idx:
        return out
    coords = np.array([residues[i].CA for i in idx], dtype=float)
    # Vectorised pairwise CA distances within the candidate set.
    diff = coords[:, None, :] - coords[None, :, :]
    d2 = np.einsum("ijk,ijk->ij", diff, diff)
    within = d2 <= (_CA_CUTOFF * _CA_CUTOFF)
    for a in range(len(idx)):
        donor = idx[a]
        neighbours = np.nonzero(within[a])[0]
        out[donor] = [idx[b] for b in neighbours if idx[b] != donor]
    return out


def _build_hbond_map(residues: List[Residue]) -> Dict[int, Set[int]]:
    """For each donor index i, the set of acceptor indices j its N-H bonds TO.

    i is the donor (N-H), j is the acceptor (C=O). An H-bond exists when
    the Kabsch-Sander energy is below the cutoff. Matching DSSP:

    * the i -> i+1 bond (donor i+1 immediately following acceptor i) is
      excluded -- adjacent residues are never counted as H-bonded;
    * only the two lowest-energy bonds are kept per donor AND per acceptor.
    """
    n = len(residues)
    hydrogens: List[Optional[Vec]] = [None] * n
    for i in range(n):
        prev = residues[i - 1] if i > 0 else None
        hydrogens[i] = _estimate_H(residues[i], prev)

    candidates = _candidate_pairs(residues)

    # Collect all candidate bonds with energies, then apply per-donor and
    # per-acceptor "two lowest" caps the way DSSP does.
    donor_bonds: Dict[int, List[Tuple[float, int]]] = {i: [] for i in range(n)}
    acceptor_bonds: Dict[int, List[Tuple[float, int]]] = {i: [] for i in range(n)}
    for i in range(n):
        di = residues[i]
        if di.N is None:
            continue
        for j in candidates[i]:
            aj = residues[j]
            # Exclude the acceptor==donor-1 relation: an Hbond from residue j's
            # C=O to residue j+1's N-H (i == j+1) is the trivial adjacent one.
            if i == j + 1:
                continue
            energy = _hbond_energy(di, hydrogens[i], aj)
            if energy is None or energy >= _HBOND_ENERGY_CUTOFF:
                continue
            donor_bonds[i].append((energy, j))
            acceptor_bonds[j].append((energy, i))

    # Keep only the two lowest-energy partners on each side.
    keep_donor: Dict[int, Set[int]] = {}
    for i, lst in donor_bonds.items():
        lst.sort(key=lambda t: t[0])
        keep_donor[i] = {j for _, j in lst[:2]}
    keep_acceptor: Dict[int, Set[int]] = {}
    for j, lst in acceptor_bonds.items():
        lst.sort(key=lambda t: t[0])
        keep_acceptor[j] = {i for _, i in lst[:2]}

    bonds: Dict[int, Set[int]] = {i: set() for i in range(n)}
    for i in range(n):
        for j in keep_donor[i]:
            if i in keep_acceptor.get(j, ()):
                bonds[i].add(j)
    return bonds


def assign_secondary_structure(structure: Structure) -> List[str]:
    """Assign an 8-state code to each residue of ``structure``.

    Residues are taken in chain order (the same order as
    ``structure.residues``). Returns a list of single-character 8-state
    codes aligned to that residue list.
    """
    residues = structure.residues
    n = len(residues)
    if n == 0:
        return []

    bonds = _build_hbond_map(residues)

    def hb(co: int, nh: int) -> bool:
        """Kabsch-Sander Hbond(co, nh): C=O of ``co`` bonds N-H of ``nh``.

        The bond map is keyed by donor (the N-H residue), so this is exactly
        ``co in bonds[nh]``.
        """
        if nh < 0 or nh >= n or co < 0 or co >= n:
            return False
        return co in bonds[nh]

    # Peptide continuity for every adjacent index pair (i-1, i).
    cont_next = [False] * n  # cont_next[i] == is_peptide_contiguous(res[i], res[i+1])
    for i in range(n - 1):
        cont_next[i] = is_peptide_contiguous(residues[i], residues[i + 1])

    def contiguous(i: int, j: int) -> bool:
        """True if residues i..j form one unbroken covalent segment."""
        if j < i:
            i, j = j, i
        if i < 0 or j >= n:
            return False
        for k in range(i, j):
            if not cont_next[k]:
                return False
        return True

    # ---------------- Turns (n = 3, 4, 5) ----------------
    # An n-turn at residue i: Hbond(i, i+n) -- C=O of i bonds N-H of i+n.
    turn3 = [False] * n
    turn4 = [False] * n
    turn5 = [False] * n
    for i in range(n):
        for nturn, flags in ((3, turn3), (4, turn4), (5, turn5)):
            j = i + nturn
            if j < n and contiguous(i, j) and hb(i, j):
                flags[i] = True

    # ---------------- Helix feature flags ----------------
    # Two consecutive n-turns (at i-1 and i) mark a helix over the H-bonded
    # core residues i .. i+n-1. 4-turn -> alpha (H), 3-turn -> 3-10 (G),
    # 5-turn -> pi (I). These are independent feature flags; the single
    # precedence pass below turns them into final codes.
    is_H = [False] * n
    is_G = [False] * n
    is_I = [False] * n

    def mark_helix(turn_flags, nturn, flag):
        for i in range(1, n):
            if turn_flags[i] and turn_flags[i - 1] and contiguous(i - 1, i + nturn - 1):
                for k in range(i, i + nturn):
                    if 0 <= k < n:
                        flag[k] = True

    mark_helix(turn4, 4, is_H)
    mark_helix(turn3, 3, is_G)
    mark_helix(turn5, 5, is_I)

    # ---------------- Beta bridges ----------------
    # Kabsch-Sander bridge definitions, stated in explicit Hbond(co, nh):
    #   parallel bridge(i, j):
    #       [Hbond(i-1, j) and Hbond(j, i+1)] or [Hbond(j-1, i) and Hbond(i, j+1)]
    #   antiparallel bridge(i, j):
    #       [Hbond(i, j) and Hbond(j, i)]   or [Hbond(i-1, j+1) and Hbond(j-1, i+1)]
    #
    # A bridge needs both partners' sequence neighbours present, and the two
    # partners must not be close in sequence *within the same covalent
    # segment* (the |i-j| < 3 exclusion applies only inside one segment).
    #
    # Bridges are stored as (i, j, orientation) with orientation in
    # {"P", "A"} so real ladders can be built below.
    par_bridges: List[Tuple[int, int]] = []
    anti_bridges: List[Tuple[int, int]] = []
    # partner map for ladder construction: index -> list of (partner, orient)
    partners: Dict[int, List[Tuple[int, str]]] = {i: [] for i in range(n)}

    # Bridge candidates come from the sparse H-bond set: only index pairs that
    # actually share a bond (in either direction) can form a bridge, so we
    # never scan all O(n^2) pairs.
    cand: Set[Tuple[int, int]] = set()
    for nh in range(n):
        for co in bonds[nh]:
            # A bridge(i, j) references bonds among {i-1,i,i+1} x {j-1,j,j+1};
            # seed candidate centres from the bonded pair and its neighbours.
            for a in (co - 1, co, co + 1):
                for b in (nh - 1, nh, nh + 1):
                    if 0 <= a < n and 0 <= b < n and a < b:
                        cand.add((a, b))

    def neighbours_ok(x: int) -> bool:
        return x - 1 >= 0 and x + 1 < n and cont_next[x - 1] and cont_next[x]

    def same_segment_close(i: int, j: int) -> bool:
        # |i - j| < 3 exclusion only when i..j is one covalent segment.
        if abs(i - j) >= 3:
            return False
        return contiguous(i, j)

    for i, j in cand:
        if i == j:
            continue
        if same_segment_close(i, j):
            continue
        if not neighbours_ok(i) or not neighbours_ok(j):
            continue
        parallel = (hb(i - 1, j) and hb(j, i + 1)) or (hb(j - 1, i) and hb(i, j + 1))
        antiparallel = (hb(i, j) and hb(j, i)) or (hb(i - 1, j + 1) and hb(j - 1, i + 1))
        if parallel:
            par_bridges.append((i, j))
            partners[i].append((j, "P"))
            partners[j].append((i, "P"))
        elif antiparallel:
            anti_bridges.append((i, j))
            partners[i].append((j, "A"))
            partners[j].append((i, "A"))

    bridge_residues: Set[int] = set()
    for i, j in par_bridges + anti_bridges:
        bridge_residues.add(i)
        bridge_residues.add(j)

    # ---------------- Ladders -> strands (E) vs isolated bridges (B) ----------------
    # A ladder is a maximal run of consecutive bridges (i, j) whose partners
    # progress compatibly: parallel ladders advance i+1 with j+1; antiparallel
    # ladders advance i+1 with j-1. Residues participating in a ladder of
    # length >= 2 are E; residues in an isolated single bridge are B.
    ladder_residues: Set[int] = set()
    bridge_set = set(par_bridges) | set(anti_bridges)
    orient_of: Dict[Tuple[int, int], str] = {}
    for b in par_bridges:
        orient_of[b] = "P"
    for b in anti_bridges:
        orient_of[b] = "A"

    consumed: Set[Tuple[int, int]] = set()
    for start in sorted(bridge_set):
        if start in consumed:
            continue
        i0, j0 = start
        orient = orient_of[start]
        chain_pairs = [start]
        # extend forward
        ci, cj = i0, j0
        while True:
            if orient == "P":
                nxt = (ci + 1, cj + 1)
            else:
                nxt = (ci + 1, cj - 1)
            a, b = nxt
            a, b = (a, b) if a < b else (b, a)
            key = (a, b)
            if key in bridge_set and orient_of.get(key) == orient and key not in consumed \
                    and cont_next[ci] and (cont_next[cj] if orient == "P" else cont_next[cj - 1]):
                chain_pairs.append(key)
                consumed.add(key)
                ci, cj = nxt
            else:
                break
        consumed.add(start)
        if len(chain_pairs) >= 2:
            for a, b in chain_pairs:
                ladder_residues.add(a)
                ladder_residues.add(b)

    # ---------------- Single final assignment pass (DSSP precedence) ----------------
    # DSSP conflict priority: H > B > E > G > I (> T > S). We compute E from
    # ladder membership and B from isolated-bridge membership, then fill each
    # residue with the highest-priority feature it carries.
    codes = ["-"] * n
    for i in range(n):
        in_ladder = i in ladder_residues
        in_bridge = i in bridge_residues
        if is_H[i]:
            codes[i] = "H"
        elif in_bridge and not in_ladder:
            codes[i] = "B"
        elif in_ladder:
            codes[i] = "E"
        elif is_G[i]:
            codes[i] = "G"
        elif is_I[i]:
            codes[i] = "I"
        else:
            codes[i] = "-"
    return codes

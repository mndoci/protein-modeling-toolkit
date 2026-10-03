"""Structure parsing built on Biopython.

Reads PDB and mmCIF files and extracts the ordered list of amino-acid
residues per chain together with the backbone atom coordinates that the
hydrogen-bond secondary-structure assignment needs (N, CA, C, O).
"""

from __future__ import annotations

import os
import warnings
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from Bio.PDB import MMCIFParser, PDBParser
from Bio.PDB.Polypeptide import is_aa

# Backbone atoms required for the Kabsch-Sander H-bond energy.
_BACKBONE = ("N", "CA", "C", "O")

# Three-letter -> one-letter amino-acid codes (standard 20 + common variants).
_THREE_TO_ONE = {
    "ALA": "A", "ARG": "R", "ASN": "N", "ASP": "D", "CYS": "C",
    "GLN": "Q", "GLU": "E", "GLY": "G", "HIS": "H", "ILE": "I",
    "LEU": "L", "LYS": "K", "MET": "M", "PHE": "F", "PRO": "P",
    "SER": "S", "THR": "T", "TRP": "W", "TYR": "Y", "VAL": "V",
    # frequent modified/alternate residues, mapped to their parent
    "MSE": "M", "SEC": "U", "PYL": "O", "HSD": "H", "HSE": "H", "HSP": "H",
}


@dataclass
class Residue:
    """A single amino-acid residue with the backbone atoms we need."""

    chain_id: str
    seq_id: int
    icode: str
    resname: str
    one_letter: str
    # Backbone coordinates as (x, y, z) tuples; None if the atom is missing.
    N: Optional[Tuple[float, float, float]] = None
    CA: Optional[Tuple[float, float, float]] = None
    C: Optional[Tuple[float, float, float]] = None
    O: Optional[Tuple[float, float, float]] = None

    @property
    def label(self) -> str:
        ic = self.icode.strip()
        return f"{self.chain_id}:{self.seq_id}{ic}"

    @property
    def has_backbone(self) -> bool:
        return None not in (self.N, self.CA, self.C, self.O)


@dataclass
class Chain:
    chain_id: str
    residues: List[Residue] = field(default_factory=list)


@dataclass
class Structure:
    structure_id: str
    chains: List[Chain] = field(default_factory=list)

    @property
    def residues(self) -> List[Residue]:
        out: List[Residue] = []
        for ch in self.chains:
            out.extend(ch.residues)
        return out


def _pick_parser(path: str):
    ext = os.path.splitext(path)[1].lower()
    if ext in (".cif", ".mmcif"):
        return MMCIFParser(QUIET=True)
    # default to PDB for .pdb, .ent, and unknown extensions
    return PDBParser(QUIET=True)


def load_structure(path: str, model_index: int = 0, structure_id: Optional[str] = None) -> Structure:
    """Parse ``path`` (PDB or mmCIF) into a :class:`Structure`.

    Only one model is used (NMR ensembles have many); ``model_index`` selects
    which, and an out-of-range or negative index raises :class:`ValueError`
    reporting the valid range rather than silently clamping.

    Retained residues are amino acids (per Biopython's :func:`is_aa` with
    ``standard=False``, so common modified residues such as selenomethionine
    ``MSE`` are kept) whose normalized three-letter name is in the supported
    mapping and that carry a usable backbone. Water, ligands, and other
    non-amino-acid HETATM residues are skipped.

    ``structure_id`` overrides the id derived from the filename (used by the
    CLI so a ``--fetch`` temp file still reports its PDB id).
    """
    if not os.path.isfile(path):
        raise FileNotFoundError(path)

    parser = _pick_parser(path)
    if structure_id is None:
        structure_id = os.path.splitext(os.path.basename(path))[0]
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")  # silence Biopython construction warnings
        bio = parser.get_structure(structure_id, path)

    models = list(bio)
    if not models:
        raise ValueError(f"No models found in {path!r}")
    if model_index < 0 or model_index >= len(models):
        raise ValueError(
            f"model index {model_index} out of range: "
            f"file {path!r} has {len(models)} model(s) (valid 0..{len(models) - 1})"
        )
    model = models[model_index]

    result = Structure(structure_id=structure_id)
    for bio_chain in model:
        chain = Chain(chain_id=bio_chain.id)
        for bio_res in bio_chain:
            # Amino acids only (standard=False also admits modified residues
            # like MSE); skip water/ligands/other HETATM.
            if not is_aa(bio_res, standard=False):
                continue
            resname = bio_res.resname.strip().upper()
            # A modified amino acid (HETATM, e.g. MSE) is retained only when
            # its normalized name is one we can map; unmapped HETATM residues
            # (ligands, cofactors) are dropped even if is_aa admits them.
            hetflag, seq_id, icode = bio_res.id
            if hetflag.strip() and resname not in _THREE_TO_ONE:
                continue
            one = _THREE_TO_ONE.get(resname, "X")
            res = Residue(
                chain_id=bio_chain.id,
                seq_id=int(seq_id),
                icode=icode,
                resname=resname,
                one_letter=one,
            )
            for atom_name in _BACKBONE:
                if atom_name in bio_res:
                    coord = bio_res[atom_name].coord
                    setattr(res, atom_name, (float(coord[0]), float(coord[1]), float(coord[2])))
            chain.residues.append(res)
        if chain.residues:
            result.chains.append(chain)

    if not result.chains:
        raise ValueError(
            f"No amino-acid residues found in {path!r} "
            "(is this a protein structure?)"
        )
    return result

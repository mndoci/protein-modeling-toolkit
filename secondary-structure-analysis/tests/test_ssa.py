"""Tests for the ssa secondary-structure analysis tool.

Uses the bundled 1CRN (crambin) structure so tests are hermetic and do
not require network access.
"""

import os

import pytest

from ssa import analyze
from ssa.assign import collapse_8_to_3
from ssa.format import format_json, format_table

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
CRN = os.path.join(DATA_DIR, "1CRN.pdb")


@pytest.fixture(scope="module")
def crn_result():
    return analyze(CRN)


def test_bundled_file_present():
    assert os.path.isfile(CRN), "bundled 1CRN.pdb missing"


def test_residue_count(crn_result):
    # Crambin (1CRN) is a 46-residue protein.
    assert crn_result.total == 46


def test_every_residue_assigned_three_state(crn_result):
    # Output shape: one 3-state code per residue, drawn from H/E/C.
    assert len(crn_result.residues) == crn_result.total
    for r in crn_result.residues:
        assert r.ss3 in ("H", "E", "C")
        assert r.ss8 in ("H", "G", "I", "E", "B", "T", "S", "-")


def test_counts_sum_to_total(crn_result):
    counts = crn_result.counts
    assert sum(counts.values()) == crn_result.total


def test_percentages_sum_to_100(crn_result):
    pcts = crn_result.percentages
    assert abs(sum(pcts.values()) - 100.0) < 1e-6


def test_sequence_and_ss_aligned(crn_result):
    assert len(crn_result.sequence) == crn_result.total
    assert len(crn_result.ss3_string) == crn_result.total


def test_crambin_has_helix_and_sheet(crn_result):
    # Crambin's fold contains two alpha helices and a small beta sheet, so a
    # correct assigner must find a substantial helix fraction and some sheet.
    counts = crn_result.counts
    assert counts["H"] >= 10, f"expected helix content, got {counts}"
    assert counts["E"] >= 2, f"expected some sheet content, got {counts}"


def test_collapse_mapping():
    assert collapse_8_to_3("H") == "H"
    assert collapse_8_to_3("G") == "H"
    assert collapse_8_to_3("I") == "H"
    assert collapse_8_to_3("E") == "E"
    assert collapse_8_to_3("B") == "E"
    assert collapse_8_to_3("T") == "C"
    assert collapse_8_to_3("S") == "C"
    assert collapse_8_to_3("-") == "C"


def test_format_table_runs(crn_result):
    out = format_table(crn_result)
    assert "Summary (3-state):" in out
    assert "Sequence :" in out


def test_format_json_valid(crn_result):
    import json

    out = format_json(crn_result)
    parsed = json.loads(out)
    assert parsed["total_residues"] == 46
    assert len(parsed["residues"]) == 46
    assert set(parsed["counts"]) == {"H", "E", "C"}


def test_cli_on_bundled_file(capsys):
    from ssa.cli import main

    rc = main([CRN])
    assert rc == 0
    captured = capsys.readouterr()
    assert "Summary (3-state):" in captured.out


def test_cli_json_format(capsys):
    import json

    from ssa.cli import main

    rc = main([CRN, "--format", "json"])
    assert rc == 0
    captured = capsys.readouterr()
    parsed = json.loads(captured.out)
    assert parsed["total_residues"] == 46

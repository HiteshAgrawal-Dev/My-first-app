"""Runs the Python <-> TypeScript parity check as part of the pytest suite (skipped without node/esbuild)."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent / "parity"))

import check_parity  # noqa: E402


@pytest.mark.skipif(not check_parity.tooling_available(), reason="node or web/node_modules esbuild not available")
def test_python_and_typescript_engines_agree():
    cases = check_parity.build_cases()
    py = check_parity.run_python(cases)
    ts = check_parity.run_ts(cases)
    mismatches = [(c, check_parity.diff(a, b)) for c, a, b in zip(cases, py, ts) if check_parity.diff(a, b)]
    assert not mismatches, mismatches[:5]

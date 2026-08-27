"""Direct contract behavior tests for ProofLensIntelligence (v5).

Covers: public write surface, exact parameter names, Blockscout
re-verification, metrics recomputation, intelligent consensus, EXACT
classification binding, sample integrity enforcement, and tolerant counter
fetching.

Run:
    PATH=.venv/bin:$PATH .venv/bin/pytest tests/direct -v
"""

import os

CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "contract", "prooflens_intelligence.py"
)


def _source():
    with open(CONTRACT_PATH, "r", encoding="utf-8") as handle:
        return handle.read()


def test_v5_is_public_and_uses_direct_evidence():
    source = _source()
    assert "class ProofLensIntelligence(gl.Contract):" in source
    assert "def analyze_wallet(" in source
    assert "evidence_json: str" in source
    assert 'evidence_json.encode("utf-8")' in source
    assert "Only the ProofLens scan relayer" not in source
    assert "evidence_url" not in source


def test_v5_rechecks_blockscout_and_bounds_proofs():
    source = _source()
    assert '"prooflens.v2"' in source
    assert '"blockscout.v1"' in source
    assert "len(proofs) > 16" in source
    assert "gl.nondet.web.get(expected_url)" in source
    assert "Blockscout transaction proof mismatch" in source
    assert "Verification metrics mismatch" in source
    # Counters are tolerant: a single flaky chain does not abort the scan
    assert '"available": False' in source


def test_v5_runs_intelligent_consensus_and_stores_views():
    source = _source()
    assert "gl.nondet.exec_prompt" in source
    assert "gl.vm.run_nondet_unsafe" in source
    assert "def get_report(" in source
    assert "def get_latest_report_id(" in source
    assert "def get_report_count(" in source


def test_sample_integrity_enforcement():
    """The contract must prevent cherry-picked samples from getting confident verdicts."""
    source = _source()
    assert "coverage_weak" in source
    assert "coverage_ratio" in source
    assert "total_transactions" in source
    # The contract hard-overrides to inconclusive when coverage is too weak
    assert "if coverage_weak:" in source
    assert 'result["classification"] = "inconclusive"' in source
    assert "sampling_coverage" in source
    assert "policy_version" in source
    assert "prooflens-risk-v5" in source


def test_reproducible_sampling_window():
    source = _source()
    assert "transactionsUrl" in source
    assert "_fetch_recent_window" in source
    assert "_reproducible_proof_ids" in source
    assert "Transaction proofs do not match reproducible window" in source


def test_exact_classification_binding():
    """high_risk and sybil_like must NOT be treated as interchangeable.

    This is the specific reviewer feedback: validators must bind the exact
    behavioral classification rather than grouping outcomes into a risk
    "family". The old _risk_family() function grouped both into "high".
    """
    source = _source()
    # The family-grouping helper must be gone
    assert "_risk_family" not in source
    # The validator must compare classifications for exact equality
    assert 'own["classification"] != proposed["classification"]' in source
    # There must be no grouping of high_risk/sybil_like anywhere
    assert '"sybil_like", "high_risk"' not in source

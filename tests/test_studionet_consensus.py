"""Live v5 StudioNet test using direct compact evidence calldata.

Verifies that a publicly submitted analyze_wallet() call reaches consensus
and stores a report with the correct exact classification binding.

Required environment:
  PROOFLENS_INTEGRATION_EVIDENCE_FILE=/path/to/downloaded-evidence.json
  PROOFLENS_INTEGRATION_WALLET=0x...
  PROOFLENS_INTEGRATION_SCAN_ID=pl_...

Run:
    PROOFLENS_INTEGRATION_EVIDENCE_FILE=./evidence.json \
    PROOFLENS_INTEGRATION_WALLET=0x... \
    PROOFLENS_INTEGRATION_SCAN_ID=pl_... \
    PATH=.venv/bin:$PATH .venv/bin/pytest tests/integration -v -s
"""

import hashlib
import json
import os

import pytest

gltest = pytest.importorskip("gltest", reason="gltest not installed in .venv")

EVIDENCE_FILE = os.environ.get("PROOFLENS_INTEGRATION_EVIDENCE_FILE", "")
WALLET = os.environ.get("PROOFLENS_INTEGRATION_WALLET", "")
SCAN_ID = os.environ.get("PROOFLENS_INTEGRATION_SCAN_ID", "")
CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "contract", "prooflens_intelligence.py"
)

requires_fixture = pytest.mark.skipif(
    not all([EVIDENCE_FILE, WALLET, SCAN_ID]),
    reason="set PROOFLENS_INTEGRATION_* variables to run live consensus",
)


@requires_fixture
def test_public_v5_analysis_reaches_consensus():
    with open(EVIDENCE_FILE, "r", encoding="utf-8") as handle:
        evidence_json = handle.read()
    evidence_hash = hashlib.sha256(evidence_json.encode("utf-8")).hexdigest()

    factory = gltest.get_contract_factory(CONTRACT_PATH)
    submitter = gltest.new_account()
    contract = factory.deploy()

    # Any funded account can submit — analyze_wallet is public.
    contract.connect(submitter).analyze_wallet(
        SCAN_ID, WALLET, evidence_json, evidence_hash
    )

    report = json.loads(contract.get_report(SCAN_ID))
    assert report["scan_id"] == SCAN_ID
    assert report["wallet"] == WALLET.lower()
    assert report["evidence_hash"] == evidence_hash
    assert report["policy_version"] == "prooflens-risk-v5"
    assert report["verdict"]["classification"] in (
        "low_risk",
        "ordinary",
        "bot_like",
        "sybil_like",
        "high_risk",
        "inconclusive",
    )

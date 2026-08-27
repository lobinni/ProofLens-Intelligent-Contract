# ProofLensIntelligence v5

Contract-focused GenLayer submission. This directory is self-contained and
contains no web frontend.

## Contents

```text
submission/
  README.md
  SUBMIT.md                         Ready-to-fill contribution form
  requirements.txt                 Contract test toolchain
  contract/
    prooflens_intelligence.py       Intelligent Contract source
  client/
    contract.ts                     Headless GenLayerJS inspect/write/read client
    evidence.ts                     Headless reproducible evidence producer
  tests/
    test_intelligence.py            Static/direct contract checks
    test_studionet_consensus.py     Live consensus integration test
  evidence/
    deployment.json                 Active v5 deployment record
    verification.example.json       Template for on-chain usage proof
```

## Purpose

`ProofLensIntelligence` verifies a bounded sample of public EVM wallet
transactions against official Blockscout endpoints, computes validator-owned
metrics, asks validator LLMs for a behavioral classification, and stores the
consensus-backed result on GenLayer.

The contract uses:

- `gl.nondet.web.get` for authoritative Blockscout records
- `gl.nondet.exec_prompt` for structured behavioral judgment
- `gl.vm.run_nondet_unsafe` with a custom comparative validator
- `TreeMap` and `u64` for persistent state
- `@gl.public.write` and `@gl.public.view` for the public contract surface

## Public API

Write:

```python
analyze_wallet(
    scan_id: str,
    wallet: str,
    evidence_json: str,
    evidence_hash: str,
) -> None
```

Views:

```python
get_report(scan_id: str) -> str
get_latest_report_id(wallet: str) -> str
get_report_count() -> u64
```

`analyze_wallet` is public. Any funded account may submit valid evidence.

## Evidence Schema

```json
{
  "schemaVersion": "prooflens.v2",
  "scanId": "pl_example",
  "wallet": "0x...",
  "verification": {
    "schemaVersion": "blockscout.v1",
    "sourceRefs": [
      {
        "chainId": "ethereum",
        "countersUrl": "https://eth.blockscout.com/api/v2/addresses/0x.../counters",
        "transactionsUrl": "https://eth.blockscout.com/api/v2/addresses/0x.../transactions"
      }
    ],
    "transactionProofs": [],
    "metrics": {}
  }
}
```

The SHA-256 of the exact `evidence_json` string is passed separately as
`evidence_hash` and recomputed inside every validator.

## Deterministic Verification

Before any LLM call, validators enforce:

1. Evidence SHA-256, schema, scan ID, and wallet must match calldata.
2. Source references must use one to six supported official Blockscout hosts.
3. Counter and transaction-list URLs must equal contract-derived canonical URLs.
4. At most 16 transaction proofs are accepted.
5. Proof hash, block, timestamp, parties, value, status, method, and contract
   flags must equal the authoritative Blockscout transaction response.
6. Every proof must involve the analyzed wallet.
7. Claimed metrics must equal metrics recomputed from verified records.

Caller analytics are never used by the model.

## Reproducible Sampling Window

Authentic proofs alone are insufficient: a caller could cherry-pick clean
transactions. v5 removes this ambiguity.

For each committed chain, validators fetch the exact first page of:

```text
/api/v2/addresses/{wallet}/transactions
```

Validators then select at most 16 records using a fixed cross-chain
round-robin in canonical order:

```text
ethereum → base → optimism → arbitrum → polygon → gnosis
```

First the newest eligible record from every chain, then the second newest,
and so on until 16 proofs are selected. The submitted proof IDs must match
this validator-derived list exactly. A selectively chosen but authentic proof
set is rejected with:

```text
[EXPECTED] Transaction proofs do not match reproducible window
```

If a transaction window cannot be fetched, validators do not pretend the
sample is representative: coverage is weak and the verdict is forced to
`inconclusive`.

Additional weak-coverage rules:

- fewer than 3 verified proofs
- no usable authoritative counters
- more than 500 total transactions with fewer than 8 proofs
- more than 5,000 total transactions with fewer than 16 proofs

## Exact Classification Binding

The prior comparator grouped classifications into broad risk families. That
allowed `high_risk` and `sybil_like` to be treated as equivalent. v5 removes
the family function completely.

The custom validator requires:

```python
if own["classification"] != proposed["classification"]:
    return False
```

Therefore every class is distinct:

```text
low_risk ≠ ordinary ≠ bot_like ≠ sybil_like ≠ high_risk ≠ inconclusive
```

Remaining consensus tolerances:

- risk score difference: at most 15
- confidence difference: at most 25
- factor codes: at least one overlap, or both empty

## Availability Behavior

Counter endpoints are supplemental coverage context. One unavailable counter
endpoint is recorded as unavailable instead of rolling back the transaction.

Transaction detail proofs remain authoritative. A malformed or mismatched
transaction proof still fails deterministically.

## Run Checks

From the repository root:

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
PATH=.venv/bin:$PATH .venv/bin/pytest submission/tests/test_intelligence.py -v
```

GenVM lint and typecheck:

```bash
PATH=.venv/bin:$PATH genvm-lint check submission/contract/prooflens_intelligence.py
PATH=.venv/bin:$PATH genvm-lint typecheck submission/contract/prooflens_intelligence.py
```

Live integration test:

```bash
PROOFLENS_INTEGRATION_EVIDENCE_FILE=./evidence.json \
PROOFLENS_INTEGRATION_WALLET=0x... \
PROOFLENS_INTEGRATION_SCAN_ID=pl_... \
PATH=.venv/bin:$PATH .venv/bin/pytest submission/tests/test_studionet_consensus.py -v -s
```

## Deployment And Verification

The policy v5 contract is deployed on GenLayer StudioNet:

```text
0x01498130561f8629EdfDf4Edc881BEa3999E1C35
```

Explorer:

```text
https://explorer-studio.genlayer.com/address/0x01498130561f8629EdfDf4Edc881BEa3999E1C35
```

This deployment contains exact classification binding and the reproducible
sampling window described above. The earlier v3 deployment remains in
`submission/evidence/deployment.json` only as historical context.

Before submitting this contract-focused package, complete the interaction
evidence:

1. Add the deployment transaction hash and timestamp to
   `submission/evidence/deployment.json` when available.
2. Produce one valid deterministic-window evidence file.
3. Execute one `analyze_wallet` transaction against the v5 address.
4. Read `get_report(scan_id)` and `get_report_count()`.
5. Copy `verification.example.json` to `verification.json` and replace every
   placeholder with the real transaction/report evidence.
6. Submit the repository folder, contract explorer URL, deployment
   transaction, analysis transaction, and stored report.

## Headless Interaction

`client/contract.ts` contains no UI. It provides:

- `assertCompatibleContract(address)`
- `submitEvidence(address, privateKey, evidence)`
- `waitForFinalized(transactionHash)`
- `readReport(address, scanId)`
- `readReportCount(address)`

It verifies the deployed schema before writing and waits for GenLayer finality.

`client/evidence.ts` fetches canonical first-page Blockscout windows, applies
the same cross-chain round-robin as validators, builds the evidence metrics,
serializes canonical JSON, and computes SHA-256. Together the two client files
form a complete headless produce → submit → finalize → read workflow.

## Review Checklist

- [x] Standalone GenVM Intelligent Contract source
- [x] Native LLM call
- [x] Native web access
- [x] Comparative equivalence principle
- [x] Deterministic source and proof verification
- [x] Reproducible sampling window
- [x] Weak coverage forces `inconclusive`
- [x] Exact classification binding
- [x] `high_risk` and `sybil_like` are not interchangeable
- [x] Public write and read methods
- [x] Headless GenLayerJS interaction code
- [x] Direct checks and live integration test
- [x] v5 deployment address recorded
- [ ] v5 deployment transaction recorded
- [ ] successful v5 `analyze_wallet` transaction recorded
- [ ] stored v5 report recorded
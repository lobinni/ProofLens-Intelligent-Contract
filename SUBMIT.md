# Contract Submission Form

Use this file as the source for the contract-focused GenLayer contribution.
The policy v5 contract is deployed. Replace the remaining transaction and
stored-report placeholders after one successful `analyze_wallet` call.

## Title

ProofLensIntelligence v5 — Reproducible EVM Wallet Evidence Classification

## Contribution Type

Intelligent Contract

## Summary

ProofLensIntelligence is a Python GenLayer Intelligent Contract that verifies
a reproducible sample of public EVM wallet transactions against official
Blockscout data and stores a validator-consensus behavioral classification.

The contract uses native web access, structured LLM reasoning, persistent
on-chain state, and a custom comparative equivalence validator. Callers cannot
cherry-pick a favorable set of authentic transactions: validators derive the
expected recent cross-chain sample independently and reject a mismatched proof
list. Weak or unavailable coverage deterministically returns `inconclusive`.

Each behavioral classification is bound exactly during consensus.
`high_risk` and `sybil_like` are not interchangeable.

## Source

```text
submission/contract/prooflens_intelligence.py
```

## Network

GenLayer StudioNet

## Contract Address

```text
0x01498130561f8629EdfDf4Edc881BEa3999E1C35
```

## Contract Explorer

```text
https://explorer-studio.genlayer.com/address/0x01498130561f8629EdfDf4Edc881BEa3999E1C35
```

## Deployment Transaction

```text
https://explorer-studio.genlayer.com/transactions/[DEPLOYMENT_TX_HASH]
```

## Successful Interaction Transaction

```text
https://explorer-studio.genlayer.com/transactions/[ANALYZE_WALLET_TX_HASH]
```

## Public Methods

```text
write analyze_wallet(scan_id, wallet, evidence_json, evidence_hash)
view  get_report(scan_id)
view  get_latest_report_id(wallet)
view  get_report_count()
```

## GenLayer-Native Features

- `gl.nondet.web.get` for independent live Blockscout retrieval
- `gl.nondet.exec_prompt` for structured wallet behavior classification
- `gl.vm.run_nondet_unsafe` with a custom comparative validator
- exact classification equality during validator comparison
- `TreeMap` / `u64` persistent storage
- `@gl.public.write` / `@gl.public.view` typed interface

## Reviewer Feedback Addressed

### Reproducible sample integrity

Validators fetch each committed chain's canonical first transaction page and
derive at most 16 expected proofs through a fixed round-robin. Submitted proof
IDs must match exactly. If any required window is unavailable, or coverage is
otherwise weak, the verdict is forced to `inconclusive` with confidence capped
at 15.

### Exact classification binding

The custom validator uses:

```python
if own["classification"] != proposed["classification"]:
    return False
```

The former broad-family comparison was removed. In particular,
`high_risk != sybil_like`.

## Stored Result Evidence

After the successful interaction, paste the exact output of
`get_report(scan_id)`:

```json
[PASTE_STORED_REPORT_JSON]
```

Report count after interaction:

```text
[PASTE_GET_REPORT_COUNT]
```

## Tests

```text
submission/tests/test_intelligence.py
submission/tests/test_studionet_consensus.py
```

## Headless Client

```text
submission/client/evidence.ts
submission/client/contract.ts
```

The client reproduces evidence, verifies the deployed schema, writes the
contract, waits for finality, and reads the stored result without any UI.
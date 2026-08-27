/**
 * Headless GenLayer client for the contract-focused submission.
 * No UI or frontend dependency: this module inspects, writes, waits, and reads.
 */

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus, type TransactionHash } from "genlayer-js/types";

export type Address = `0x${string}`;

export interface SubmissionEvidence {
  scanId: string;
  wallet: string;
  canonicalJson: string;
  sha256: string;
}

export function createPublicContractClient() {
  return createClient({ chain: studionet });
}

export function createSigningContractClient(privateKey: Address) {
  const account = createAccount(privateKey);
  return createClient({ chain: studionet, account });
}

export async function assertCompatibleContract(address: Address) {
  const client = createPublicContractClient();
  const schema = await client.getContractSchema(address);
  const methods = Object.keys(schema.methods ?? {}).sort();
  const analyze = schema.methods?.analyze_wallet;
  const params = (analyze?.params ?? []).map(([name]) => name);
  const compatible =
    Boolean(analyze) &&
    analyze?.readonly === false &&
    params.join(",") === "scan_id,wallet,evidence_json,evidence_hash" &&
    methods.includes("get_report") &&
    methods.includes("get_latest_report_id") &&
    methods.includes("get_report_count");
  if (!compatible) {
    throw new Error(`Incompatible contract schema. Methods: ${methods.join(", ")}`);
  }
  return { schema, methods, params };
}

export async function submitEvidence(
  contractAddress: Address,
  privateKey: Address,
  evidence: SubmissionEvidence,
): Promise<TransactionHash> {
  await assertCompatibleContract(contractAddress);
  const client = createSigningContractClient(privateKey);
  return client.writeContract({
    address: contractAddress,
    functionName: "analyze_wallet",
    args: [evidence.scanId, evidence.wallet, evidence.canonicalJson, evidence.sha256],
    value: 0n,
    consensusMaxRotations: 5,
  });
}

export async function waitForFinalized(hash: TransactionHash) {
  return createPublicContractClient().waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    retries: 60,
    interval: 5000,
  });
}

export async function readReport(contractAddress: Address, scanId: string) {
  const raw = await createPublicContractClient().readContract({
    address: contractAddress,
    functionName: "get_report",
    args: [scanId],
  });
  return raw ? JSON.parse(String(raw)) : null;
}

export async function readReportCount(contractAddress: Address): Promise<number> {
  const raw = await createPublicContractClient().readContract({
    address: contractAddress,
    functionName: "get_report_count",
    args: [],
  });
  return Number(raw);
}
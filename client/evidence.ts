/** Headless reproducible evidence producer for ProofLensIntelligence v5. */

import { createHash } from "node:crypto";

export const CHAIN_HOSTS = {
  ethereum: "https://eth.blockscout.com",
  base: "https://base.blockscout.com",
  optimism: "https://optimism.blockscout.com",
  arbitrum: "https://arbitrum.blockscout.com",
  polygon: "https://polygon.blockscout.com",
  gnosis: "https://gnosis.blockscout.com",
} as const;

export type ChainId = keyof typeof CHAIN_HOSTS;
const CHAIN_ORDER = Object.keys(CHAIN_HOSTS) as ChainId[];
const MAX_PROOFS = 16;

type AddressMeta = { hash?: string; is_contract?: boolean } | null;
type RawTransaction = {
  hash?: string;
  block_number?: number | string | null;
  timestamp?: string | null;
  from?: AddressMeta;
  to?: AddressMeta;
  created_contract?: AddressMeta;
  value?: string | null;
  status?: string | null;
  result?: string | null;
  method?: string | null;
  decoded_input?: { method_call?: string } | null;
};

export interface Proof {
  chainId: ChainId;
  hash: string;
  url: string;
  blockNumber: number | null;
  timestamp: string | null;
  from: string;
  to: string | null;
  value: string;
  status: string | null;
  method: string | null;
  targetIsContract: boolean;
  createdContract: boolean;
}

function addressHash(value: AddressMeta): string | null {
  const hash = value?.hash;
  return typeof hash === "string" ? hash.toLowerCase() : null;
}

function transactionMethod(tx: RawTransaction): string | null {
  if (tx.method !== null && tx.method !== undefined) return String(tx.method);
  const call = tx.decoded_input?.method_call;
  return typeof call === "string" ? call.split("(")[0] : null;
}

function canonicalTransaction(chainId: ChainId, tx: RawTransaction): Proof {
  const created = addressHash(tx.created_contract ?? null);
  const target = created ? tx.created_contract ?? null : tx.to ?? null;
  return {
    chainId,
    hash: String(tx.hash ?? "").toLowerCase(),
    url: `${CHAIN_HOSTS[chainId]}/api/v2/transactions/${String(tx.hash ?? "").toLowerCase()}`,
    blockNumber:
      tx.block_number === null || tx.block_number === undefined
        ? null
        : Number(tx.block_number),
    timestamp: tx.timestamp === null || tx.timestamp === undefined ? null : String(tx.timestamp),
    from: addressHash(tx.from ?? null) ?? "",
    to: addressHash(target),
    value: String(tx.value ?? "0"),
    status:
      tx.status !== null && tx.status !== undefined
        ? String(tx.status)
        : tx.result !== null && tx.result !== undefined
          ? String(tx.result)
          : null,
    method: transactionMethod(tx),
    targetIsContract: Boolean(target?.is_contract),
    createdContract: created !== null,
  };
}

async function fetchWindow(chainId: ChainId, wallet: string): Promise<Proof[]> {
  const url = `${CHAIN_HOSTS[chainId]}/api/v2/addresses/${wallet}/transactions`;
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${chainId} transaction window returned ${response.status}`);
  const payload = (await response.json()) as { items?: RawTransaction[] };
  if (!Array.isArray(payload.items)) throw new Error(`${chainId} transaction window is invalid`);
  return payload.items
    .map((tx) => canonicalTransaction(chainId, tx))
    .filter(
      (record) =>
        record.timestamp !== null &&
        !record.createdContract &&
        (record.from === wallet || record.to === wallet),
    );
}

function roundRobin(windows: Map<ChainId, Proof[]>): Proof[] {
  const selected: Proof[] = [];
  let row = 0;
  while (selected.length < MAX_PROOFS) {
    let added = false;
    for (const chainId of CHAIN_ORDER) {
      const record = windows.get(chainId)?.[row];
      if (record) {
        selected.push(record);
        added = true;
        if (selected.length === MAX_PROOFS) break;
      }
    }
    if (!added) break;
    row++;
  }
  return selected;
}

function isFailed(status: string | null): boolean {
  return ["error", "failure", "reverted"].some((part) =>
    (status ?? "").toLowerCase().includes(part),
  );
}

function metrics(proofs: Proof[], wallet: string) {
  const direction = (proof: Proof) => {
    if (proof.from === wallet && proof.to === wallet) return "self";
    return proof.from === wallet ? "outbound" : "inbound";
  };
  const outbound = proofs.filter((proof) => direction(proof) === "outbound");
  const timestamps = proofs
    .map((proof) => proof.timestamp)
    .filter((value): value is string => value !== null)
    .sort();
  return {
    sampledTransactions: proofs.length,
    sampledOutbound: outbound.length,
    sampledInbound: proofs.filter((proof) => direction(proof) === "inbound").length,
    sampledSelf: proofs.filter((proof) => direction(proof) === "self").length,
    sampledFailed: proofs.filter((proof) => isFailed(proof.status)).length,
    sampledContractCalls: outbound.filter(
      (proof) => !proof.createdContract && (proof.targetIsContract || proof.method !== null),
    ).length,
    sampledContractCreations: outbound.filter((proof) => proof.createdContract).length,
    sampledChains: new Set(proofs.map((proof) => proof.chainId)).size,
    firstActivityAt: timestamps[0] ?? null,
    lastActivityAt: timestamps[timestamps.length - 1] ?? null,
  };
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(object[key])}`)
    .join(",")}}`;
}

export async function buildEvidence(
  walletInput: string,
  selectedChains: ChainId[],
  scanId: string,
) {
  const wallet = walletInput.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new Error("Invalid EVM wallet");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(scanId)) throw new Error("Invalid scan ID");

  const selected = CHAIN_ORDER.filter((chain) => selectedChains.includes(chain));
  if (selected.length === 0) throw new Error("Select at least one chain");
  const entries = await Promise.all(
    selected.map(async (chain) => [chain, await fetchWindow(chain, wallet)] as const),
  );
  const windows = new Map<ChainId, Proof[]>(entries);
  const proofs = roundRobin(windows);
  const sourceRefs = selected.map((chainId) => ({
    chainId,
    countersUrl: `${CHAIN_HOSTS[chainId]}/api/v2/addresses/${wallet}/counters`,
    transactionsUrl: `${CHAIN_HOSTS[chainId]}/api/v2/addresses/${wallet}/transactions`,
  }));
  const evidence = {
    schemaVersion: "prooflens.v2",
    scanId,
    wallet,
    verification: {
      schemaVersion: "blockscout.v1",
      sourceRefs,
      transactionProofs: proofs,
      metrics: metrics(proofs, wallet),
    },
  };
  const canonicalJson = canonicalStringify(evidence);
  const sha256 = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
  return { evidence, canonicalJson, sha256 };
}
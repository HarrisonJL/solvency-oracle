// Long-running, unattended: retries attest() for each demo asset that
// doesn't yet have a committed attestation, with backoff between attempts,
// until every asset succeeds once or its per-asset attempt cap is hit.
// Logs every attempt with a timestamp so the full history is visible
// afterward regardless of outcome - this is meant to run overnight.
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

const ADDRESS = "0xD62Fc7B7Dc5bf68F8F3a28E20aD6C47E8403652A" as `0x${string}`;
const ASSETS = ["XUSD", "YUSD"];
const MAX_ATTEMPTS_PER_ASSET = 20;
const SLEEP_BETWEEN_MS = 90_000;

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });
  log(`Acting as ${account.address}, target ${ADDRESS}`);

  const succeeded = new Set<string>();
  const gaveUp = new Set<string>();
  const attempts: Record<string, number> = Object.fromEntries(ASSETS.map((a) => [a, 0]));

  while (succeeded.size + gaveUp.size < ASSETS.length) {
    for (const assetId of ASSETS) {
      if (succeeded.has(assetId) || gaveUp.has(assetId)) continue;

      attempts[assetId]++;
      const before: any = await client.readContract({ address: ADDRESS, functionName: "get_state", args: [] });
      log(`${assetId}: attempt ${attempts[assetId]}/${MAX_ATTEMPTS_PER_ASSET} - attestation_count before: ${before.attestation_count}`);

      try {
        const txHash = await client.writeContract({ address: ADDRESS, functionName: "attest", args: [assetId, 500], value: 0n });
        log(`${assetId}: submitted ${txHash}`);
        const receipt: any = await client.waitForTransactionReceipt({
          hash: txHash as `0x${string}` & { length: 66 },
          status: "FINALIZED" as any,
          interval: 15000,
          retries: 200,
        });
        log(`${assetId}: ${receipt.txExecutionResultName} (result ${receipt.result}, resultName ${receipt.resultName})`);
      } catch (err: any) {
        log(`${assetId}: submission/wait error - ${err?.shortMessage || err?.message || String(err)}`);
      }

      const after: any = await client.readContract({ address: ADDRESS, functionName: "get_state", args: [] });
      log(`${assetId}: attestation_count after: ${after.attestation_count}`);

      if (Number(after.attestation_count) > Number(before.attestation_count)) {
        log(`${assetId}: SUCCESS on attempt ${attempts[assetId]}`);
        succeeded.add(assetId);
      } else if (attempts[assetId] >= MAX_ATTEMPTS_PER_ASSET) {
        log(`${assetId}: giving up after ${MAX_ATTEMPTS_PER_ASSET} attempts`);
        gaveUp.add(assetId);
      } else {
        log(`${assetId}: did not commit, will retry after backoff`);
      }
    }
    if (succeeded.size + gaveUp.size < ASSETS.length) {
      log(`Sleeping ${SLEEP_BETWEEN_MS / 1000}s before next round...`);
      await sleep(SLEEP_BETWEEN_MS);
    }
  }

  const finalState: any = await client.readContract({ address: ADDRESS, functionName: "get_state", args: [] });
  log(`Final get_state(): ${safeJson(finalState)}`);
  for (let i = 0; i < Number(finalState.attestation_count); i++) {
    const a = await client.readContract({ address: ADDRESS, functionName: "get_attestation", args: [i] });
    log(`get_attestation(${i}): ${safeJson(a)}`);
  }
  log(`Done. Succeeded: [${[...succeeded].join(", ")}]. Gave up: [${[...gaveUp].join(", ")}].`);
  process.exit(gaveUp.size > 0 ? 1 : 0);
}

main().catch((err) => {
  log(`FATAL: ${err?.stack || String(err)}`);
  process.exit(1);
});

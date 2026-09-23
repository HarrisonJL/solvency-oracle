// One-off: retry attest() for a list of assets, one at a time, printing
// the actual result code for each - not just trusting the receipt looked
// clean.
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

async function main() {
  const address = process.argv[2];
  const assetIds = process.argv.slice(3);
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });

  for (const assetId of assetIds) {
    const before: any = await client.readContract({ address: address as `0x${string}`, functionName: "get_state", args: [] });
    const txHash = await client.writeContract({
      address: address as `0x${string}`,
      functionName: "attest",
      args: [assetId, 500],
      value: 0n,
    });
    console.log(`attest(${assetId}) submitted ${txHash} - waiting...`);
    const receipt: any = await client.waitForTransactionReceipt({
      hash: txHash as `0x${string}` & { length: 66 },
      status: "FINALIZED" as any,
      interval: 15000,
      retries: 240,
    });
    console.log(`  -> ${receipt.txExecutionResultName} (result ${receipt.result}, resultName ${receipt.resultName})`);
    const after: any = await client.readContract({ address: address as `0x${string}`, functionName: "get_state", args: [] });
    console.log(`  attestation_count: ${before.attestation_count} -> ${after.attestation_count}`);
  }

  const state: any = await client.readContract({ address: address as `0x${string}`, functionName: "get_state", args: [] });
  console.log("\nFinal get_state():", state);
  for (let i = 0; i < Number(state.attestation_count); i++) {
    const a = await client.readContract({ address: address as `0x${string}`, functionName: "get_attestation", args: [i] });
    console.log(`get_attestation(${i}):`, safeJson(a));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

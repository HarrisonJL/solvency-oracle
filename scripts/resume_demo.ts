// One-off: resume attest_demo.ts after a partial failure - registers
// YUSD only if not already present, then fires both attest() calls.
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

const RAW_BASE = "https://raw.githubusercontent.com/HarrisonJL/solvency-oracle/main/demo";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

async function writeAndWait(client: any, address: string, functionName: string, args: unknown[]) {
  const txHash = await client.writeContract({ address, functionName, args, value: 0n });
  console.log(`${functionName}(${JSON.stringify(args[0])}) submitted ${txHash} - waiting...`);
  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}` & { length: 66 },
    status: "FINALIZED" as any,
    interval: 15000,
    retries: 240,
  });
  console.log(`  -> ${receipt.txExecutionResultName} (result ${receipt.result})`);
  return receipt;
}

async function main() {
  const address = process.argv[2];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });
  console.log(`Acting as ${account.address}`);

  const assets: any = await client.readContract({ address: address as `0x${string}`, functionName: "list_assets", args: [] });
  const haveYUSD = assets.some((a: any) => a.asset_id === "YUSD");
  if (!haveYUSD) {
    await writeAndWait(client, address, "register_asset", [
      "YUSD",
      "Example Stablecoin (undercollateralised demo)",
      [`${RAW_BASE}/example_undercollateralised_reserves.md`],
      10000,
      "1:1 USD reserve (demo)",
    ]);
  } else {
    console.log("YUSD already registered, skipping.");
  }

  await writeAndWait(client, address, "attest", ["XUSD", 500]);
  await writeAndWait(client, address, "attest", ["YUSD", 500]);

  const state: any = await client.readContract({ address: address as `0x${string}`, functionName: "get_state", args: [] });
  console.log("\nget_state():", state);
  for (let i = 0; i < Number(state.attestation_count); i++) {
    const a = await client.readContract({ address: address as `0x${string}`, functionName: "get_attestation", args: [i] });
    console.log(`get_attestation(${i}):`, safeJson(a));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

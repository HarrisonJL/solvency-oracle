// Registers two demo assets and fires real attest() calls against real
// public pages (this repo's own demo/ files, served raw from GitHub) -
// one deliberately solvent, one deliberately undercollateralised, so a
// clean SOLVENT verdict isn't just the oracle rubber-stamping everything.
//
// Usage: npx tsx scripts/attest_demo.ts <contract_address>
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

const RAW_BASE = "https://raw.githubusercontent.com/HarrisonJL/solvency-oracle/main/demo";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

async function writeAndWait(client: any, functionName: string, args: unknown[]) {
  const txHash = await client.writeContract({
    address: process.argv[2] as `0x${string}`,
    functionName,
    args,
    value: 0n,
  });
  console.log(`${functionName}(${JSON.stringify(args[0])}) submitted ${txHash} - waiting for finality...`);
  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}` & { length: 66 },
    status: "FINALIZED" as any,
    interval: 15000,
    retries: 240,
  });
  console.log(`  -> ${receipt.txExecutionResultName}`);
  return receipt;
}

async function main() {
  const address = process.argv[2];
  if (!address) throw new Error("Usage: tsx scripts/attest_demo.ts <contract_address>");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!rawKey) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });
  console.log(`Acting as ${account.address}`);

  await writeAndWait(client, "register_asset", [
    "XUSD",
    "Example Stablecoin (solvent demo)",
    [`${RAW_BASE}/example_solvent_reserves.md`],
    10000, // 1.0x required
    "1:1 USD reserve (demo)",
  ]);
  await writeAndWait(client, "register_asset", [
    "YUSD",
    "Example Stablecoin (undercollateralised demo)",
    [`${RAW_BASE}/example_undercollateralised_reserves.md`],
    10000,
    "1:1 USD reserve (demo)",
  ]);

  await writeAndWait(client, "attest", ["XUSD", 500]);
  await writeAndWait(client, "attest", ["YUSD", 500]);

  const state: any = await client.readContract({ address: address as `0x${string}`, functionName: "get_state", args: [] });
  console.log("\nget_state():", state);

  for (const [assetId, attestationId] of [["XUSD", 0], ["YUSD", 1]] as const) {
    const a = await client.readContract({
      address: address as `0x${string}`,
      functionName: "get_attestation",
      args: [attestationId],
    });
    console.log(`get_attestation(${attestationId}) for ${assetId}:`, safeJson(a));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

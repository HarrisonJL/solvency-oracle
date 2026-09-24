// One-off: registers the multi-source demo asset (MUSD, two independent
// source URLs) and attests it, demonstrating the contract's
// MAX_SOURCE_URLS=3 cross-source capability that the first two demo
// assets never exercised.
import { createClient, createAccount, chains } from "genlayer-js";
import "dotenv/config";

const RAW_BASE = "https://raw.githubusercontent.com/HarrisonJL/solvency-oracle/main/demo";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function writeAndWait(client: any, address: string, functionName: string, args: unknown[]) {
  const fees = await client.estimateTransactionFees({});
  const txHash = await client.writeContract({
    address,
    functionName,
    args,
    fees: { distribution: fees.distribution, feeValue: fees.feeValue },
  });
  console.log(`${functionName}(${JSON.stringify(args[0])}) submitted ${txHash} - waiting...`);
  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
    interval: 5000,
    retries: 60,
  });
  console.log(`  -> txExecutionResultName=${receipt.txExecutionResultName} status_name=${receipt.status_name} result_name=${receipt.result_name}`);
  return { txHash, receipt };
}

async function main() {
  const address = process.argv[2];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });
  console.log(`Acting as ${account.address}, target ${address}`);

  await writeAndWait(client, address, "register_asset", [
    "MUSD",
    "Multi-Source Stablecoin (demo)",
    [`${RAW_BASE}/example_multisource_treasury.md`, `${RAW_BASE}/example_multisource_audit.md`],
    10000,
    "1:1 USD reserve, cross-checked across two independent sources (demo)",
  ]);

  const before: any = await client.readContract({ address, functionName: "get_state", args: [] });
  console.log("Before attest:", before);

  await writeAndWait(client, address, "attest", ["MUSD", 500]);

  const after: any = await client.readContract({ address, functionName: "get_state", args: [] });
  console.log("After attest:", after);

  const asset = await client.readContract({ address, functionName: "get_asset", args: ["MUSD"] });
  console.log("get_asset(MUSD):", safeJson(asset));

  for (let i = Number(before.attestation_count); i < Number(after.attestation_count); i++) {
    const a = await client.readContract({ address, functionName: "get_attestation", args: [i] });
    console.log(`get_attestation(${i}):`, safeJson(a));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

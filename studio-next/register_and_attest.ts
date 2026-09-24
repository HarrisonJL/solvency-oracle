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
    retries: 120,
  });
  console.log(`  -> statusName=${receipt.statusName} resultName=${receipt.resultName} txExecutionResultName=${receipt.txExecutionResultName}`);
  return receipt;
}

async function main() {
  const address = process.argv[2];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });
  console.log(`Acting as ${account.address}, target ${address}`);

  await writeAndWait(client, address, "register_asset", [
    "XUSD",
    "Example Stablecoin (solvent demo)",
    [`${RAW_BASE}/example_solvent_reserves.md`],
    10000,
    "1:1 USD reserve (demo)",
  ]);
  await writeAndWait(client, address, "register_asset", [
    "YUSD",
    "Example Stablecoin (undercollateralised demo)",
    [`${RAW_BASE}/example_undercollateralised_reserves.md`],
    10000,
    "1:1 USD reserve (demo)",
  ]);

  const stateAfterReg: any = await client.readContract({ address, functionName: "get_state", args: [] });
  console.log("After registration:", stateAfterReg);

  await writeAndWait(client, address, "attest", ["XUSD", 500]);
  await writeAndWait(client, address, "attest", ["YUSD", 500]);

  const finalState: any = await client.readContract({ address, functionName: "get_state", args: [] });
  console.log("Final get_state():", finalState);
  for (let i = 0; i < Number(finalState.attestation_count); i++) {
    const a = await client.readContract({ address, functionName: "get_attestation", args: [i] });
    console.log(`get_attestation(${i}):`, safeJson(a));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

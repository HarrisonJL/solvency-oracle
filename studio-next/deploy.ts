import { createClient, createAccount, chains } from "genlayer-js";
import "dotenv/config";
import * as fs from "fs";

async function main() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });
  console.log(`Acting as ${account.address}`);

  const code = fs.readFileSync("../contracts/solvency_oracle_studio_next.py", "utf-8");

  const fees = await client.estimateTransactionFees({});
  console.log("Estimated fees:", JSON.stringify(fees, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));

  const txHash = await client.deployContract({
    code,
    args: [],
    fees: { distribution: fees.distribution, feeValue: fees.feeValue },
  });
  console.log(`Deploy tx: ${txHash}`);

  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash,
    waitUntil: "finalized",
    interval: 5000,
    retries: 120,
  });
  console.log("Receipt:", JSON.stringify(receipt, (_k, v) => (typeof v === "bigint" ? v.toString() : v)).slice(0, 2000));
  console.log("Contract address:", receipt.contractAddress ?? receipt.data?.contract_address ?? "(check receipt)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// One-off: retry a single attest() call, with proper status checking
// (not just trusting txExecutionResultName) - the lesson this contract's
// live testing just proved the hard way.
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

const STATUS_NAMES: Record<string, string> = {
  "5": "ACCEPTED", "6": "UNDETERMINED", "7": "FINALIZED", "8": "CANCELED",
  "12": "VALIDATORS_TIMEOUT", "13": "LEADER_TIMEOUT",
};

async function main() {
  const address = process.argv[2];
  const assetId = process.argv[3];
  const toleranceBps = Number(process.argv[4] ?? "500");

  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });

  const txHash = await client.writeContract({
    address: address as `0x${string}`,
    functionName: "attest",
    args: [assetId, toleranceBps],
    value: 0n,
  });
  console.log(`Submitted ${txHash} - waiting for finality...`);
  const receipt: any = await client.waitForTransactionReceipt({
    hash: txHash as `0x${string}` & { length: 66 },
    status: "FINALIZED" as any,
    interval: 15000,
    retries: 240,
  });
  console.log("txExecutionResultName:", receipt.txExecutionResultName);
  console.log("result code:", receipt.result, "-", receipt.result === 1 ? "clean" : "NOT CLEAN - check manually");

  const state: any = await client.readContract({ address: address as `0x${string}`, functionName: "get_state", args: [] });
  console.log("get_state():", state);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

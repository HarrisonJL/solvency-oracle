// One-off: fire a deliberate duplicate register_asset() call (should
// assert-fail) against the live contract, to see exactly how a
// deterministic revert surfaces - as a thrown client-side exception, or
// as an ACCEPTED/FINALIZED status with a separate failure indicator that
// a naive status-only check might miss.
import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

async function main() {
  const address = process.argv[2];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });

  try {
    const txHash = await client.writeContract({
      address: address as `0x${string}`,
      functionName: "register_asset",
      args: ["XUSD", "duplicate attempt", ["https://example.com/x"], 10000, "test"],
      value: 0n,
    });
    console.log(`Submitted ${txHash} - waiting for finality...`);
    const receipt: any = await client.waitForTransactionReceipt({
      hash: txHash as `0x${string}` & { length: 66 },
      status: "FINALIZED" as any,
      interval: 15000,
      retries: 240,
    });
    console.log("waitForTransactionReceipt returned WITHOUT throwing:");
    console.log("  status:", receipt.status);
    console.log("  txExecutionResultName:", receipt.txExecutionResultName);
    console.log("  result code:", receipt.result);

    const tx: any = await client.getTransaction({ hash: txHash as `0x${string}` & { length: 66 } });
    console.log("getTransaction() raw fields:");
    console.log("  status:", tx.status);
    console.log("  result:", tx.result);
    console.log("  full tx keys:", Object.keys(tx));
  } catch (err: any) {
    console.log("THREW an exception instead:");
    console.log("  message:", err.message?.slice(0, 500));
  }
}

main();

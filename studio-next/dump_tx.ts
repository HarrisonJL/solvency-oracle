import { createClient, createAccount, chains } from "genlayer-js";
import "dotenv/config";

async function main() {
  const hash = process.argv[2];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });

  const tx = await client.getTransaction({ hash });
  console.log("getTransaction:", JSON.stringify(tx, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));

  try {
    const trace = await client.debugTraceTransaction({ hash });
    console.log("debugTraceTransaction:", JSON.stringify(trace, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  } catch (err: any) {
    console.log("debugTraceTransaction error:", err?.shortMessage || err?.message || String(err));
  }
}
main().catch((e) => { console.error(e); process.exit(1); });

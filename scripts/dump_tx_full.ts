import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

async function main() {
  const hash = process.argv[2];
  const client = createClient({ chain: testnetBradbury });
  const tx: any = await client.getTransaction({ hash: hash as `0x${string}` & { length: 66 } });
  console.log(safeJson(tx));
}
main().catch((err) => { console.error(err); process.exit(1); });

import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

function safeJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v), 2);
}

async function main() {
  const address = process.argv[2];
  const id = Number(process.argv[3]);
  const client = createClient({ chain: testnetBradbury });
  const a = await client.readContract({
    address: address as `0x${string}`,
    functionName: "get_attestation",
    args: [id],
  });
  console.log(safeJson(a));
}
main().catch((err) => { console.error(err); process.exit(1); });

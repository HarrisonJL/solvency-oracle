import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import "dotenv/config";

async function main() {
  const address = process.argv[2];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client = createClient({ chain: testnetBradbury, account });
  const assets: any = await client.readContract({ address: address as `0x${string}`, functionName: "list_assets", args: [] });
  console.log(JSON.stringify(assets, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});

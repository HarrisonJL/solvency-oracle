import { createClient, createAccount, chains } from "genlayer-js";
import "dotenv/config";

async function main() {
  const address = process.argv[2];
  const functionName = process.argv[3];
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const account = createAccount((rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`) as `0x${string}`);
  const client: any = createClient({ chain: (chains as any).studioDevnet, account });
  const result = await client.readContract({ address, functionName, args: [] });
  console.log(result);
}
main().catch((e) => { console.error(e); process.exit(1); });

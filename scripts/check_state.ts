// Quick read-only check against a deployed SolvencyOracle contract.
// Usage: npx tsx scripts/check_state.ts <contract_address> [asset_id]
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

async function main() {
  const address = process.argv[2];
  if (!address) throw new Error("Usage: tsx scripts/check_state.ts <contract_address> [asset_id]");
  const assetId = process.argv[3];

  const client = createClient({ chain: testnetBradbury });
  const state = await client.readContract({
    address: address as `0x${string}`,
    functionName: "get_state",
    args: [],
  });
  console.log("get_state():", state);

  const assets = await client.readContract({
    address: address as `0x${string}`,
    functionName: "list_assets",
    args: [],
  });
  console.log("list_assets():", assets);

  if (assetId) {
    const asset = await client.readContract({
      address: address as `0x${string}`,
      functionName: "get_asset",
      args: [assetId],
    });
    console.log(`get_asset(${assetId}):`, asset);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

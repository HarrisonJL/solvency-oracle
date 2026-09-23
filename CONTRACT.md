# Deployment

- **Address:** [`0x37850c223b492A365990DeD4A8cD6bfC188e5A0e`](https://explorer-bradbury.genlayer.com/address/0x37850c223b492A365990DeD4A8cD6bfC188e5A0e)
- **Network:** GenLayer Bradbury Testnet (chain id `4221`)
- **Deploy tx:** [`0xd9718766a3e7eba10dd02bb5d07bb450f6e93b8ec35cc08f0fbf965d65551ee1`](https://explorer-bradbury.genlayer.com/tx/0xd9718766a3e7eba10dd02bb5d07bb450f6e93b8ec35cc08f0fbf965d65551ee1)
- **Deployer:** `0x5cdb5699bc1038e115A973bb91A646f7E98C075b`

Confirmed genuinely readable post-deploy via a real `get_state()` call.

## Live proof: two real attestations, one clean, one that needed a retry

Two demo assets registered ([`demo/example_solvent_reserves.md`](demo/example_solvent_reserves.md), [`demo/example_undercollateralised_reserves.md`](demo/example_undercollateralised_reserves.md), served raw from this repo on GitHub - real public pages, not mocked):

- `register_asset("XUSD", ..., threshold_bps: 10000)` - tx [`0x3adba59b...`](https://explorer-bradbury.genlayer.com/tx/0x3adba59b07a060b5bf83add3096abada91791f1e5a1f3af1ec9ce9efe2968027)
- `register_asset("YUSD", ..., threshold_bps: 10000)` - tx [`0x2b5cc48b...`](https://explorer-bradbury.genlayer.com/tx/0x2b5cc48bcbd51565d33c94d31514c7c6516390bb89261bc013382d8dcb564586)

### XUSD - clean consensus on the first try

`attest("XUSD", 500)` - tx [`0x872564df...`](https://explorer-bradbury.genlayer.com/tx/0x872564dff78f98df3c1606f997e0bc6c4ff81d666be53d997f81ffa85f0f6ca9): single round, 5/5 validators, unanimous result hash, result code `1` (clean).

```json
{
  "asset_id": "XUSD",
  "reserves_bps": 1250000000000,
  "liabilities_bps": 1000000000000,
  "coverage_bps": 12500,
  "verdict": "SOLVENT",
  "tolerance_bps": 500
}
```

$125M reserves / $100M liabilities = 1.25x, exactly what the source page states, extracted live by real validators and agreed within 5% - **SOLVENT**, correctly.

### YUSD - a real failure, then a clean retry (kept, not hidden)

The first `attest("YUSD", 500)` - tx [`0x8f2da989...`](https://explorer-bradbury.genlayer.com/tx/0x8f2da989b98487b5c4003ace808cb561ca72b33237c1d42efaff3809bfdb382f) - escalated through an appeal to an 11-validator round that came back split: some validators timed out, others computed mismatched result hashes (6 vs 5), overall result code `2` (not clean). A naive check (`txExecutionResultName !== "FINISHED_WITH_ERROR"`) would have reported this as a success - it was not. `get_state()` immediately after showed `attestation_count` still at 1, proving the write never actually committed. This is documented, not hidden, in the README's "Known limitations."

A retry - tx [`0xdb325bf6...`](https://explorer-bradbury.genlayer.com/tx/0xdb325bf6087dd192568e4fb3d435515d747b1feee794d4a74f049b9eae2dbe9b) - reached clean consensus, result code `1`:

```json
{
  "asset_id": "YUSD",
  "reserves_bps": 700000000000,
  "liabilities_bps": 1000000000000,
  "coverage_bps": 7000,
  "verdict": "UNDERCOLLATERALISED",
  "tolerance_bps": 500
}
```

$70M reserves / $100M liabilities = 0.70x, correctly flagged as **UNDERCOLLATERALISED** against the 1.0x threshold - a genuinely different verdict from XUSD's, proving the oracle isn't rubber-stamping every asset SOLVENT.

`get_state()` after both: `{ asset_count: 2, attestation_count: 2 }`.

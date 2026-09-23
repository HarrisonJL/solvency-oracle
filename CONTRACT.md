# Deployment

- **Address:** [`0xD62Fc7B7Dc5bf68F8F3a28E20aD6C47E8403652A`](https://explorer-bradbury.genlayer.com/address/0xD62Fc7B7Dc5bf68F8F3a28E20aD6C47E8403652A)
- **Network:** GenLayer Bradbury Testnet (chain id `4221`)
- **Deploy tx:** [`0xa63abe04283257a4de726a8a96c960d3326f5e2f0ac7529842b4a87b096ed47b`](https://explorer-bradbury.genlayer.com/tx/0xa63abe04283257a4de726a8a96c960d3326f5e2f0ac7529842b4a87b096ed47b)
- **Deployer:** `0x5cdb5699bc1038e115A973bb91A646f7E98C075b`

Confirmed genuinely readable post-deploy via a real `get_state()` call. This is a redeploy of the contract below, with one fix: `_readings_agree` now also requires the leader's and validator's own readings to imply the *same verdict* (`SOLVENT`/`UNDERCOLLATERALISED`), not just individually-tolerant reserves and liabilities - see "Design notes" in the README. Both demo assets are registered (`asset_count: 2`).

## Live re-attestation: pending calmer network conditions

Both demo assets (`XUSD`, `YUSD`) registered cleanly on this contract - txs [`0xea5cd18c...`](https://explorer-bradbury.genlayer.com/tx/0xea5cd18c8af8a7f8e6bcc3974bbfef246c331b74748bf3af49e9decb3b1e93dc) and prior registrations, both `FINISHED_WITH_RETURN`, confirmed via `get_state()` showing `asset_count: 2`.

`attest()`, however, failed to reach clean consensus on six consecutive attempts across both assets in one session (2026-09-23), diagnosed via `getTransaction()` on each tx rather than assumed:

- Multiple validator **TIMEOUT**s (3-5 of the validators consulted never completed their web-fetch + LLM-extraction round in time) - e.g. tx [`0x92663c94...`](https://explorer-bradbury.genlayer.com/tx/0x92663c949623c0f6b4d709936ad9574cf6a8cba76e322b76732a169207759da1).
- One raw RPC fetch failure reading transaction status back (`fetch failed`, a network-level hiccup, not a consensus result).
- One 17-validator appeal cascade (from an initial 3), split near-evenly between two result hashes, with every individual vote logged as `TIMEOUT` or `DETERMINISTIC_VIOLATION` and no vote ever cleanly resolving to `AGREE` - tx [`0x693fd619...`](https://explorer-bradbury.genlayer.com/tx/0x693fd6199945c311dba23989cdbd3cdcba23ffb360f89f668013ca04f6ff374a).

Each `attest()` printed `FINISHED_WITH_RETURN` in the submitting script's log, but `get_state()` read independently after every attempt confirmed `attestation_count` never moved from `0` - the log line alone is not proof of a committed write (see the YUSD story below, and the README's "Known limitations").

Ruled out before concluding this is network noise rather than a regression from the fix: the demo pages fetch in 70-300ms (not a slow source), and `XUSD`'s real coverage (1.25x) sits 2500bps clear of its 1.0x threshold - far outside any plausible range for LLM-extraction noise to flip the verdict, which is what the fix's new check actually gates on. The fix's correctness is proven directly by two new unit tests (`test_validator_disagrees_when_individually_tolerant_shifts_flip_the_verdict`, `test_validator_agrees_when_same_direction_shifts_preserve_the_verdict`) exercising exactly this boundary via `direct_vm.run_validator()`, independent of live network conditions. Live re-attestation against this address will be added here once it succeeds.

## Superseded: pre-audit-fix deployment

- **Address:** [`0x37850c223b492A365990DeD4A8cD6bfC188e5A0e`](https://explorer-bradbury.genlayer.com/address/0x37850c223b492A365990DeD4A8cD6bfC188e5A0e)
- **Deploy tx:** [`0xd9718766a3e7eba10dd02bb5d07bb450f6e93b8ec35cc08f0fbf965d65551ee1`](https://explorer-bradbury.genlayer.com/tx/0xd9718766a3e7eba10dd02bb5d07bb450f6e93b8ec35cc08f0fbf965d65551ee1)
- **Deployer:** `0x5cdb5699bc1038e115A973bb91A646f7E98C075b`

Superseded by the redeploy above, which fixes the verdict-consistency gap described in the README's "Design notes." The live proof below remains accurate for *this* address and is kept as evidence the underlying consensus mechanics (web-fetch, LLM extraction, tolerance comparison, retry-on-split-vote) work end to end - the fix changes what counts as "agreement," not how attestation or retries work.

### Live proof: two real attestations, one clean, one that needed a retry

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

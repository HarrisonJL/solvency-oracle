# Deployment

- **Address:** [`0x194F0cCA91ee7244938519F1475F43C65d4E71Bc`](https://explorer-studio-dev.genlayer.com/address/0x194F0cCA91ee7244938519F1475F43C65d4E71Bc)
- **Network:** GenLayer Studio Next (chain id `61997`)
- **Deploy tx:** `0xd9e88105d2db6fb3944f42e0fb50a8a41b0705efb7bb01081f6106a53fe0050d`
- **Deployer:** `0x5cdb5699bc1038e115A973bb91A646f7E98C075b`
- **Contract source:** [`contracts/solvency_oracle_studio_next.py`](contracts/solvency_oracle_studio_next.py) - functionally identical to [`contracts/solvency_oracle.py`](contracts/solvency_oracle.py); only GenVM import/decorator conventions differ between runtime generations. See [`studio-next/README.md`](studio-next/README.md) for the exact diff and why this variant has no local Direct Mode test coverage (Studio Next runs a runtime newer than any public GenVM release, so it can't be simulated locally - it's verified live instead, below).

## Live proof: both demo assets, both attestations, clean on the first try

Two demo assets registered ([`demo/example_solvent_reserves.md`](demo/example_solvent_reserves.md), [`demo/example_undercollateralised_reserves.md`](demo/example_undercollateralised_reserves.md), served raw from this repo on GitHub - real public pages, not mocked):

- `register_asset("XUSD", ..., threshold_bps: 10000)` - tx `0x37351b73bd57deea169b34ad5b024f67ce537191607d94e512c5224e048cac49`
- `register_asset("YUSD", ..., threshold_bps: 10000)` - tx `0x5b2449ed415544e07b494ea0d7ea72506a2aac5da0a405d329608dea998502ae`

`attest("XUSD", 500)` - tx `0x868c7ccbfb8a8800fff66b9c9abe0f851b211a88e76f1bc7efccd2b056ab44ad`:

```json
{
  "asset_id": "XUSD",
  "reserves_bps": 1250000000000,
  "liabilities_bps": 1000000000000,
  "coverage_bps": 12500,
  "verdict": "SOLVENT",
  "tolerance_bps": 500,
  "attested_at": "2026-09-24T13:46:28.672377+00:00"
}
```

`attest("YUSD", 500)` - tx `0xd46b2f47b7cad72614ebc3a7b3a6d2b93478fa61007aef8403a32de1e02a6b70`:

```json
{
  "asset_id": "YUSD",
  "reserves_bps": 700000000000,
  "liabilities_bps": 1000000000000,
  "coverage_bps": 7000,
  "verdict": "UNDERCOLLATERALISED",
  "tolerance_bps": 500,
  "attested_at": "2026-09-24T13:47:21.880565+00:00"
}
```

Both committed cleanly - no retry, no appeal, no timeout: `get_state()` after both reads `{ asset_count: 2, attestation_count: 2 }`. $125M/$100M = 1.25x (SOLVENT) and $70M/$100M = 0.70x (UNDERCOLLATERALISED) - genuinely different verdicts, both extracted live by real validators via real web fetches and LLM extraction, not hardcoded or mocked.

## Live proof: multi-source cross-checking (a capability that existed but was never demoed)

The contract has always supported up to `MAX_SOURCE_URLS = 3` independent source URLs
per asset, cross-hashed - neither XUSD nor YUSD used more than one. A third demo asset,
MUSD, registers two independently-styled pages ([issuer treasury report](demo/example_multisource_treasury.md),
[separate auditor confirmation](demo/example_multisource_audit.md)) reporting the same
figures, so `attest()` actually has to fetch and agree across both:

- `register_asset("MUSD", ..., [treasury_url, audit_url], threshold_bps: 10000)` - tx `0x00fc94e00134416b4631e30633d167c48c6abc2d5ea4d2c1345026bf66161241`
- `attest("MUSD", 500)` - tx `0xde25e9e9e4b0b5d1c99884c65a6fccdaa1707d3788df0169c979ca0b272d48a9`:

```json
{
  "asset_id": "MUSD",
  "reserves_bps": 1800000000000,
  "liabilities_bps": 1500000000000,
  "coverage_bps": 12000,
  "verdict": "SOLVENT",
  "tolerance_bps": 500,
  "source_hashes_json": "[\"07c8396749d1fe7802a322e22641381731d28588f315d60a8407f12c99946522\", \"dbce9418d911935dc14466bfec4a8d82f41a745673b0688d0af0ddfbf50910d2\"]",
  "attested_at": "2026-09-24T14:57:27.013568+00:00"
}
```

Two distinct source hashes recorded, one per page - concrete on-chain evidence both
sources were actually fetched and cross-checked, not just the first one.

## Porting from Bradbury to Studio Next

The contract was originally built and audited against GenVM v0.2.11 (Bradbury's runtime).
Moving to Studio Next (a newer runtime generation) surfaced three mechanical
incompatibilities, found by iterating against the live network's own schema-check and
error tracebacks rather than guessed:

1. **Deploy header**: the pinned `py-genlayer` runner hash from the old header doesn't
   exist on Studio Next's node. Fixed by using the hash Studio Next's own `:test` tag
   resolves to, confirmed against GenLayer's own live reference contracts in the Studio
   Next IDE (`_hello_world.py`, `wizard_of_coin.py`, etc.).
2. **Import/decorator conventions**: `from genlayer import *` no longer binds a `gl`
   name; the new convention is `import genlayer as gl` plus explicit
   `from genlayer.types import *` / `from genlayer.storage import TreeMap, DynArray`.
   `@allow_storage` was replaced by `@gl.storage.allow` + `@dataclass` together.
   `gl.Contract` became `gl.contract.Contract`.
3. **One genuine runtime bug**: `gl.message_raw['datetime']` doesn't exist in the new
   package - confirmed via a temporary `debug_gl()` probe method deployed specifically
   to introspect `dir(gl.message)` live, rather than guessed. The replacement,
   `gl.message.datetime`, was confirmed present and correctly formatted before being
   adopted.

The underlying consensus primitives (`gl.vm.run_nondet`, `gl.eq_principle.*`) were
confirmed byte-for-byte identical between the two GenVM versions before concluding this
was a mechanical port rather than a logic change requiring re-verification of the
tolerance/verdict-consistency fix itself.

## Historical: Bradbury deployments

SolvencyOracle was originally built and live-tested on GenLayer Bradbury Testnet (chain
`4221`) before moving to Studio Next. Both Bradbury deployments below remain live and
readable; they're kept as evidence the underlying mechanics work on more than one
network, not as the current primary deployment.

### Post-audit-fix Bradbury deployment

- **Address:** [`0xD62Fc7B7Dc5bf68F8F3a28E20aD6C47E8403652A`](https://explorer-bradbury.genlayer.com/address/0xD62Fc7B7Dc5bf68F8F3a28E20aD6C47E8403652A)
- **Deploy tx:** [`0xa63abe04283257a4de726a8a96c960d3326f5e2f0ac7529842b4a87b096ed47b`](https://explorer-bradbury.genlayer.com/tx/0xa63abe04283257a4de726a8a96c960d3326f5e2f0ac7529842b4a87b096ed47b)

Carries the verdict-consistency fix (see "Design notes" in the README). Both demo assets
are registered (`asset_count: 2`), but six consecutive `attest()` attempts against it
failed to reach clean consensus in one session (2026-09-23) - validator timeouts, one raw
RPC fetch failure, and one 17-validator appeal cascade, none of them ever reaching a
clean `AGREE`. Full diagnostic detail (tx hashes, vote breakdowns) is preserved in this
file's git history. This - not a logic regression - is what motivated evaluating Studio
Next as an alternative network: a same-night control test against the *original*
pre-fix Bradbury deployment (below) succeeded cleanly, twice, under the same network
conditions, which combined with a validator-overlap check ruled out both "the fix caused
it" and "the whole network is just down." The likely cause is cold-start overhead
specific to freshly-deployed contracts on Bradbury, not anything under this project's
control.

### Original pre-audit-fix Bradbury deployment

- **Address:** [`0x37850c223b492A365990DeD4A8cD6bfC188e5A0e`](https://explorer-bradbury.genlayer.com/address/0x37850c223b492A365990DeD4A8cD6bfC188e5A0e)
- **Deploy tx:** [`0xd9718766a3e7eba10dd02bb5d07bb450f6e93b8ec35cc08f0fbf965d65551ee1`](https://explorer-bradbury.genlayer.com/tx/0xd9718766a3e7eba10dd02bb5d07bb450f6e93b8ec35cc08f0fbf965d65551ee1)

Superseded by the fix above. Live proof here predates the fix and is kept as evidence
the underlying consensus mechanics (web-fetch, LLM extraction, tolerance comparison,
retry-on-split-vote) work end to end on Bradbury specifically:

- `register_asset("XUSD", ...)` - tx `0x3adba59b07a060b5bf83add3096abada91791f1e5a1f3af1ec9ce9efe2968027`
- `register_asset("YUSD", ...)` - tx `0x2b5cc48bcbd51565d33c94d31514c7c6516390bb89261bc013382d8dcb564586`
- `attest("XUSD", 500)` - tx `0x872564dff78f98df3c1606f997e0bc6c4ff81d666be53d997f81ffa85f0f6ca9`: clean on the first try, 5/5 validators, result `SOLVENT` (1.25x coverage).
- `attest("YUSD", 500)` - first attempt (tx `0x8f2da989b98487b5c4003ace808cb561ca72b33237c1d42efaff3809bfdb382f`) escalated to an 11-validator split vote and did **not** commit (`get_state()` confirmed `attestation_count` unchanged, despite the tx looking superficially successful in a naive log line) - documented rather than hidden, and the direct motivation for this project's emphasis on independently verifying state after every write. A retry (tx `0xdb325bf6087dd192568e4fb3d435515d747b1feee794d4a74f049b9eae2dbe9b`) reached clean consensus: `UNDERCOLLATERALISED` (0.70x coverage).

`get_state()` after both: `{ asset_count: 2, attestation_count: 2 }`.

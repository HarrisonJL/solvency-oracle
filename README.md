# SolvencyOracle

A reusable proof-of-reserves attestation primitive for [GenLayer](https://genlayer.com): register an asset with its public reserve/attestation pages and a required coverage ratio, and any caller can trigger a real validator committee to fetch those pages live, extract the reserves and liabilities, and reach consensus on a `SOLVENT` / `UNDERCOLLATERALISED` verdict - with an exact, mathematically-guaranteed tolerance on the numbers, not a rounded guess.

**Live on GenLayer's Bradbury testnet. Testnet only.**

## The problem this solves

Proof-of-reserves today mostly means "trust the exchange's own attestation page" or "trust a single auditor's PDF, published once a quarter, by a firm the issuer pays." Nobody on-chain independently re-derives the number. GenLayer's validator committee changes that: instead of one party publishing a claim, `attest()` has multiple independent validators each fetch the same public pages themselves and extract the same figures - the verdict only lands if they agree.

This is also, deliberately, a generalization of a mistake this account already made twice. The sibling [Ballpark](https://github.com/HarrisonJL/ballpark) project builds a general numeric consensus oracle and went through two real steward rejections getting the equivalence check right: first for allowing too wide a tolerance to mean anything, then for a significant-figure-rounding "fix" that silently didn't enforce the tolerance it claimed to. SolvencyOracle reuses that hard-won, now-correct design (`_within_tolerance`, verbatim in spirit) rather than re-deriving it - see that project's README for the full story of why a precise, uniform relative-tolerance check on raw values is the only version of this that actually works.

## How it works

`register_asset(asset_id, name, source_urls, threshold_bps, standard)` - permissionless, and once registered, immutable:

- `asset_id`: a short identifier, e.g. `"USDX"`.
- `source_urls`: 1-3 `https://` public pages that state or imply the asset's reserves and liabilities.
- `threshold_bps`: the minimum coverage ratio required to be `SOLVENT`, in basis points (`10000` = 1.0x / fully backed).
- `standard`: a free-text description of the backing claim (e.g. `"1:1 USD reserve"`) - descriptive, not enforced.

`attest(asset_id, tolerance_bps)` - permissionless, runs real consensus:

```python
def leader_fn() -> str:
    return _fetch_and_extract(source_urls)      # fetch every source fresh, extract via LLM

def validator_fn(leaders_res) -> bool:
    if not isinstance(leaders_res, gl.vm.Return):
        return False
    mine = _fetch_and_extract(source_urls)       # this validator's OWN independent fetch + extraction
    return _readings_agree(leaders_res.calldata, mine, tolerance_bps)

raw_json = gl.vm.run_nondet(leader_fn, validator_fn)
```

Every validator (leader included) fetches every source URL live via `gl.nondet.web.render` and extracts `total_reserves`/`total_liabilities` via `gl.nondet.exec_prompt`. Agreement requires *both* figures to be within `tolerance_bps` of the leader's (precise relative-tolerance check, capped at `MAX_TOLERANCE_BPS = 2000`, 20% - same cap and reasoning as Ballpark). The stored attestation is the leader's raw reading; `coverage_bps = reserves * 10000 // liabilities` is computed deterministically afterward, and the verdict follows mechanically: `SOLVENT` if coverage meets the asset's threshold, `UNDERCOLLATERALISED` if not, `INCONCLUSIVE` if either figure - or liabilities being exactly zero - couldn't be extracted. Every stored source page is also SHA-256 hashed for audit, though the hash is never part of the agreement check (see "Design notes").

## Design notes

**Prompt injection.** The fetched page text is explicitly fenced as untrusted content inside the extraction prompt, with an instruction not to treat anything inside it as instructions - the same defensive pattern Wizard's Coin uses for its adversarial user input, applied here to adversarial *web content* instead.

**Source hashes are audit evidence, not a consensus input.** A validator fetching the same URL a few seconds after the leader can legitimately get different byte content (ads, cache-busting params, a live counter) while the actual reserves/liabilities figures the page reports stay the same. `_readings_agree` only compares the two extracted numbers - never the hashes - and the stored `source_hashes_json` always reflects the leader's own fetch, purely so a reader can independently verify what page state a given attestation was based on.

**Immutable registration, by design.** An asset's source URLs and threshold never change after registration. This is deliberately less flexible than allowing updates (a v2 would need an owner-gated update path, or a versioned re-registration), but it means a historical attestation's context can never be quietly altered out from under it.

**All-or-nothing across reserves and liabilities**, same reasoning as Ballpark's metric vector: if either figure disagrees beyond tolerance, the whole attestation fails to reach consensus (`UNDETERMINED` at the protocol level) rather than storing a partial result.

## Verified platform facts

Bradbury runs GenVM **v0.2.11**. Two things confirmed directly against the version-matched SDK source before writing this contract, not assumed from the sibling projects' notes:

- `gl.nondet.web.render(url, mode="text")` returns a plain `str` of the rendered page - confirmed in `genlayer/gl/nondet/web.py`. Combining it with `gl.nondet.exec_prompt` inside the same `run_nondet` leader/validator closure is fine; the only nondet restriction that actually applies (`SystemError: 6`, confirmed via `gltest`'s Direct Mode source) is against *cross-contract* calls inside a nondet block, which this contract never makes.
- `TreeMap[str, V]` (used for the asset registry) is a real, fully-implemented `MutableMapping` - confirmed in `genlayer/py/storage/tree_map.py`. The correct way to insert a new storage-backed value is `get_or_insert_default(k)` followed by setting its fields, exactly mirroring `DynArray.append_new_get()`'s pattern - not constructing a Python object and assigning it directly, which isn't how these storage-backed struct types are meant to be built.

## Testing

`tests/test_solvency_oracle.py` (25 tests, `genlayer-test` Direct Mode) covers three layers:

1. **Registration** - input validation, immutability, multi-registrant behavior.
2. **Integration** (real `attest()` calls, both the web fetch *and* the LLM extraction mocked via `direct_vm.mock_web`/`mock_llm`) - all three verdicts, source-hash recording, multi-source fetching, state bookkeeping.
3. **Consensus-boundary tests** via `direct_vm.run_validator(leader_result=...)` - the same cheatcode proven in the sibling Ballpark project, needed because Direct Mode only *captures* `validator_fn` rather than simulating a real vote. Exact boundary cases (agrees at precisely `tolerance_bps`, disagrees one unit past it), a test that both reserves *and* liabilities must independently agree, and an explicit test that source-hash differences never affect agreement.

```bash
python3.14 -m venv .venv && source .venv/bin/activate
pip install "genlayer-test[sim]==0.29.2" genvm-linter==0.11.0
genvm-lint check contracts/solvency_oracle.py
pytest tests/ -v
```

## Deployment

See [`CONTRACT.md`](CONTRACT.md) for the live address, deploy tx, and a real attestation of two demo assets (one solvent, one deliberately undercollateralised).

```bash
npm install
# DEPLOYER_PRIVATE_KEY in .env (gitignored, never commit a private key)
npm run deploy
npx tsx scripts/attest_demo.ts <contract_address>
```

## Known limitations

- **Testnet only.**
- **`attest()` genuinely needs a retry more often than a pure-LLM nondet call does.** Confirmed live, not theoretical: of the two demo attestations in `CONTRACT.md`, one reached clean 5/5 consensus on the first try; the other escalated through an appeal round to 11 validators, came back with a mix of timeouts and mismatched result hashes, and finalized *without* actually committing its state change - the on-chain `attestation_count` proved it, even though the naive receipt-level check a first-pass verification script used looked like success. A retry then succeeded cleanly. The likely cause: every validator has to independently fetch a live web page *and* run an LLM extraction within the same round, which is real-world-latency-heavier than the pure-LLM calls every other contract in this account makes, and appears to push some validators past whatever timeout a round allows. Any caller (and any UI) built on this contract needs to check the actual resolved status - `ACCEPTED`/`FINALIZED` with a clean result code, not merely "the transaction didn't error" - and be prepared to retry, exactly the same lesson already learned the hard way for Ballpark and this account's dashboards, just showing up again in a new place.
- **Extraction quality depends on source quality.** A page that states figures ambiguously, or requires JS rendering `gl.nondet.web.render` doesn't execute, will produce `INCONCLUSIVE` attestations rather than a guess - by design, but it means garbage sources produce no signal rather than a false one.
- **`standard` is descriptive, not enforced** - the contract has no way to verify that a registered asset's actual backing composition matches the claimed standard, only that the reserve/liability *numbers* a page reports meet the stated threshold.
- **No spam/cost control beyond the URL-count and tolerance caps** - a production deployment serving untrusted callers would likely want a small fee on `attest()`, mirroring Wizard's Coin's fee mechanism, deliberately left out here to keep the primitive minimal.
- **Immutable registration means a stale or dead source URL has no update path** in this version - see "Design notes."

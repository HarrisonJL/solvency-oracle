# Studio Next deployment tooling

SolvencyOracle's primary live deployment is on [GenLayer Studio Next](https://studio-dev.genlayer.com)
(chain `61997`), not Bradbury. This directory holds the tooling that targets it, kept
separate from the parent directory's scripts for one reason: **Studio Next requires
`genlayer-js@2.0.0-rc.1`** (unreleased) for its `studioDevnet` chain preset and explicit
fees API (`estimateTransactionFees`, `deployContract({ fees })`). The parent directory's
scripts use the stable `genlayer-js@1.1.8` for Bradbury. Mixing both major versions in one
`node_modules` isn't practical, hence the separate `package.json` here.

## The contract itself lives in `../contracts/solvency_oracle_studio_next.py`

Not in this directory - it's tracked as an ordinary contract source file next to
`../contracts/solvency_oracle.py` (the Bradbury/test-covered version). The two are
functionally identical; only the GenVM import/decorator conventions differ, because
Studio Next runs a newer runtime generation. Confirmed via a real, byte-for-byte diff
of the SDK source (see the repo's git history for this directory's introduction) that
`vm.py` and `eq_principle.py` - the actual consensus primitives - are unchanged between
GenVM v0.2.11 (Bradbury) and v0.3.0-rc7 (the last public tag). What changed is purely
mechanical:

| | Bradbury (`solvency_oracle.py`) | Studio Next (`solvency_oracle_studio_next.py`) |
|---|---|---|
| Header | pins `py-genlayer:1jb45aa8...` | pins `py-genlayer:5jycge4q8...` (the hash Studio Next's `:test` tag currently resolves to - confirmed against GenLayer's own live reference contracts in the Studio Next IDE) |
| Import | `from genlayer import *` | `import genlayer as gl` + `from genlayer.types import *` + `from genlayer.storage import TreeMap, DynArray` |
| Storage decorator | `@allow_storage` | `@gl.storage.allow` + `@dataclass` |
| Contract base | `gl.Contract` | `gl.contract.Contract` |
| Current time | `gl.message_raw['datetime']` | `gl.message.datetime` (the one genuine runtime bug found - `message_raw` doesn't exist in the new package at all; caught via a temporary `debug_gl()` probe method, not guessed) |

## Why this file has no local test coverage

`gltest`'s Direct Mode simulates a specific pinned GenVM build locally. Studio Next
turned out to be running a `py-lib-genlayer-std` build **newer than the last public
GenVM release** (`v0.3.0-rc7` on GitHub) - the runner hash it resolves live isn't in
that release's published artifact. There is currently no fetchable bundle that matches
Studio Next's exact live runtime, so Direct Mode cannot execute this file at all (it
fails with `Runner hash ... not found`, an artifact-availability problem, not a code
problem).

Given the underlying consensus code is confirmed unchanged, this file's correctness
is verified differently: **against the live network directly**, the same way any other
builder integrating with Studio Next would have to. See `../CONTRACT.md` for the live
proof (both demo assets registered, both attestations committed cleanly, correct
SOLVENT/UNDERCOLLATERALISED verdicts, extracted from real pages by a real LLM, agreed on
by real validators). If `gltest` ever ships a version pin matching Studio Next's live
runtime, this file should be brought under the main test suite the same way the
Bradbury version is.

## genlayer-js v2 client gotchas (confirmed live, not from docs)

- **Explicit fees are required.** `deployContract`/`writeContract` fail with
  `FeesDistributionMissing` unless you pass `fees: { distribution, feeValue }` from
  `client.estimateTransactionFees({})` first (or `estimateTransactionFeesForWrite`,
  though that one 500'd server-side against this network - the generic estimator
  worked fine for both deploy and write).
- **`getTransaction()` and `waitForTransactionReceipt()` return inconsistently-cased
  field names for the same data.** `getTransaction()` returns `statusName` (camelCase);
  `waitForTransactionReceipt()` returns `status_name` (snake_case) for the identical
  field. Both agree on `last_round`/`last_leader`/`round_validators`/
  `validator_votes_name` (all snake_case) and `txExecutionResultName` (camelCase in
  both). Worth double-checking with a real call rather than assuming one method's
  casing carries over to the other - this cost real debugging time once already (see
  `pegwatch/src/lib/pollTransaction.ts`).
- **`waitForTransactionReceipt`'s old `status: "FINALIZED"` param is deprecated** in
  favor of `waitUntil: "decided" | "finalized"`.

## Scripts

- `npm run check-schema` - validates the contract against Studio Next's live runner
  without spending a deploy. Run this after any edit, before `deploy`.
- `npm run deploy` - deploys `../contracts/solvency_oracle_studio_next.py`, prints the
  new address.
- `npx tsx register_and_attest.ts <address>` - registers both demo assets (XUSD, YUSD)
  and fires both attestations against a deployed address.
- `npx tsx call_view.ts <address> <method>` - calls any read-only view method.
- `npx tsx dump_tx.ts <hash>` - full raw transaction dump, including the Python
  traceback on a `FINISHED_WITH_ERROR` result, for diagnosing failures.

"""
Deterministic tests for SolvencyOracle using genlayer-test's Direct Mode.

Three layers:

1. Registration tests - input validation and immutability of the asset
   registry.
2. Integration tests (real attest() calls, both the web fetch and the LLM
   extraction mocked): verdict computation (SOLVENT / UNDERCOLLATERALISED
   / INCONCLUSIVE), source-hash recording, state bookkeeping.
3. Consensus-boundary tests via direct_vm.run_validator: Direct Mode runs
   leader_fn directly and only *captures* validator_fn for later
   inspection (it doesn't simulate a real multi-validator vote
   in-process), so exact, deterministic boundary tests need the same
   run_validator(leader_result=...) cheatcode already proven in the
   sibling Ballpark project - re-invoking the real captured validator_fn
   with an explicit hypothetical leader result.
"""

import json

import pytest

URL = "https://example.com/reserves"
URL_2 = "https://example.com/liabilities"


def _deploy(direct_vm, direct_deploy, owner):
    direct_vm.sender = owner
    return direct_deploy("contracts/solvency_oracle.py")


def _mock_page(direct_vm, url, body):
    direct_vm.mock_web(url, {"method": "GET", "status": 200, "body": body})


def _mock_llm(direct_vm, reserves, liabilities):
    direct_vm.mock_llm(
        "extracting proof-of-reserves",
        json.dumps({"total_reserves": reserves, "total_liabilities": liabilities}),
    )


def _register(so, asset_id="USDX", threshold_bps=10000, urls=None):
    so.register_asset(asset_id, "USD Coin X", urls or [URL], threshold_bps, "1:1 USD reserve")


# --- Registration -----------------------------------------------------------


def test_initial_state(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    state = so.get_state()
    assert state == {"asset_count": 0, "attestation_count": 0}


def test_register_asset_succeeds_and_is_readable(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)

    asset = so.get_asset("USDX")
    assert asset["name"] == "USD Coin X"
    assert json.loads(asset["source_urls_json"]) == [URL]
    assert asset["threshold_bps"] == 10000
    assert asset["standard"] == "1:1 USD reserve"

    assert so.get_state()["asset_count"] == 1
    assert so.list_assets() == [{"asset_id": "USDX", "name": "USD Coin X", "threshold_bps": 10000}]


def test_register_asset_rejects_duplicate_asset_id(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    with pytest.raises(Exception):
        _register(so)


def test_register_asset_rejects_non_https_url(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    with pytest.raises(Exception):
        so.register_asset("USDX", "USD Coin X", ["http://example.com/reserves"], 10000, "1:1")


def test_register_asset_rejects_too_many_urls(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    with pytest.raises(Exception):
        so.register_asset("USDX", "USD Coin X", [URL, URL, URL, URL], 10000, "1:1")


def test_register_asset_rejects_no_urls(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    with pytest.raises(Exception):
        so.register_asset("USDX", "USD Coin X", [], 10000, "1:1")


def test_register_asset_rejects_empty_name(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    with pytest.raises(Exception):
        so.register_asset("USDX", "", [URL], 10000, "1:1")


def test_register_asset_allows_different_registrants(direct_vm, direct_deploy, direct_owner, direct_alice):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so, "USDX")
    direct_vm.sender = direct_alice
    _register(so, "USDY")
    assert so.get_state()["asset_count"] == 2


# --- Integration: attest() happy paths --------------------------------------


def test_attest_records_solvent_verdict(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so, threshold_bps=10000)  # must be >= 1.0x covered
    _mock_page(direct_vm, URL, "Total reserves: $50,000,000. Total liabilities: $40,000,000.")
    _mock_llm(direct_vm, reserves=500000000000, liabilities=400000000000)  # 1.25x

    so.attest("USDX", 500)

    a = so.get_attestation(0)
    assert a["asset_id"] == "USDX"
    assert a["reserves_bps"] == 500000000000
    assert a["liabilities_bps"] == 400000000000
    assert a["coverage_bps"] == 12500  # 1.25x
    assert a["verdict"] == "SOLVENT"
    assert so.get_state()["attestation_count"] == 1


def test_attest_records_undercollateralised_verdict(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so, threshold_bps=10000)
    _mock_page(direct_vm, URL, "Total reserves: $8,000,000. Total liabilities: $10,000,000.")
    _mock_llm(direct_vm, reserves=80000000000, liabilities=100000000000)  # 0.8x

    so.attest("USDX", 500)

    a = so.get_attestation(0)
    assert a["coverage_bps"] == 8000  # 0.8x
    assert a["verdict"] == "UNDERCOLLATERALISED"


def test_attest_records_inconclusive_when_reserves_missing(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "This page says nothing about reserves.")
    _mock_llm(direct_vm, reserves=None, liabilities=100000000000)

    so.attest("USDX", 500)

    a = so.get_attestation(0)
    assert a["verdict"] == "INCONCLUSIVE"
    assert a["coverage_bps"] == 0


def test_attest_records_inconclusive_when_liabilities_zero(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "Reserves: $1. Liabilities: $0.")
    _mock_llm(direct_vm, reserves=10000, liabilities=0)

    so.attest("USDX", 500)

    a = so.get_attestation(0)
    assert a["verdict"] == "INCONCLUSIVE"


def test_attest_treats_negative_extracted_value_as_not_extracted(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "Reserves: -$5. Liabilities: $10.")
    _mock_llm(direct_vm, reserves=-50000, liabilities=100000)

    so.attest("USDX", 500)

    a = so.get_attestation(0)
    assert a["verdict"] == "INCONCLUSIVE"


def test_attest_records_source_hashes(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "Total reserves: $50,000,000. Total liabilities: $40,000,000.")
    _mock_llm(direct_vm, reserves=500000000000, liabilities=400000000000)

    so.attest("USDX", 500)

    hashes = json.loads(so.get_attestation(0)["source_hashes_json"])
    assert len(hashes) == 1
    assert len(hashes[0]) == 64  # sha256 hex digest


def test_attest_with_multiple_sources(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so, urls=[URL, URL_2])
    _mock_page(direct_vm, URL, "Reserves page: $50,000,000 in reserves.")
    _mock_page(direct_vm, URL_2, "Liabilities page: $40,000,000 in liabilities.")
    _mock_llm(direct_vm, reserves=500000000000, liabilities=400000000000)

    so.attest("USDX", 500)

    hashes = json.loads(so.get_attestation(0)["source_hashes_json"])
    assert len(hashes) == 2
    assert hashes[0] != hashes[1]


def test_get_attestations_paginates_newest_first(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "page 1")
    _mock_llm(direct_vm, reserves=100000, liabilities=100000)
    so.attest("USDX", 500)
    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page 2")
    _mock_llm(direct_vm, reserves=200000, liabilities=100000)
    so.attest("USDX", 500)

    recent = so.get_attestations(0, 10)
    assert [a["reserves_bps"] for a in recent] == [200000, 100000]


# --- Validation -------------------------------------------------------------


def test_attest_rejects_unknown_asset_id(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    with pytest.raises(Exception):
        so.attest("NOPE", 500)


def test_attest_rejects_tolerance_over_20_percent(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    with pytest.raises(Exception):
        so.attest("USDX", 2001)


# --- Consensus boundary: the real validator_fn, via run_validator ----------


def test_validator_agrees_within_tolerance(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=100000, liabilities=100000)
    so.attest("USDX", 500)  # captures the validator_fn for this call

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=102000, liabilities=100000)  # reserves 2% off - within 5%
    leader_result = json.dumps({"reserves": 100000, "liabilities": 100000, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is True


def test_validator_agrees_at_exact_tolerance_boundary(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=10000, liabilities=10000)
    so.attest("USDX", 500)

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=10500, liabilities=10000)  # exactly 5% off reserves
    leader_result = json.dumps({"reserves": 10000, "liabilities": 10000, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is True


def test_validator_disagrees_one_unit_past_boundary(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=10000, liabilities=10000)
    so.attest("USDX", 500)

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=10501, liabilities=10000)  # one unit past 5%
    leader_result = json.dumps({"reserves": 10000, "liabilities": 10000, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is False


def test_validator_requires_both_reserves_and_liabilities_to_agree(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=100000, liabilities=100000)
    so.attest("USDX", 500)

    direct_vm.clear_mocks()
    # reserves match exactly, liabilities wildly off
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=100000, liabilities=500000)
    leader_result = json.dumps({"reserves": 100000, "liabilities": 100000, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is False


def test_validator_disagrees_when_only_one_side_has_null(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=100000, liabilities=100000)
    so.attest("USDX", 500)

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=None, liabilities=100000)
    leader_result = json.dumps({"reserves": 100000, "liabilities": 100000, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is False


def test_validator_agrees_when_both_sides_null(direct_vm, direct_deploy, direct_owner):
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=None, liabilities=None)
    so.attest("USDX", 500)

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page")
    _mock_llm(direct_vm, reserves=None, liabilities=None)
    leader_result = json.dumps({"reserves": None, "liabilities": None, "source_hashes": []})
    assert direct_vm.run_validator(leader_result=leader_result) is True


def test_validator_ignores_source_hash_differences(direct_vm, direct_deploy, direct_owner):
    # A page can change between the leader's fetch and a validator's,
    # even when the reported figures don't - source_hashes must never be
    # part of the agreement check.
    so = _deploy(direct_vm, direct_deploy, direct_owner)
    _register(so)
    _mock_page(direct_vm, URL, "page version 1")
    _mock_llm(direct_vm, reserves=100000, liabilities=100000)
    so.attest("USDX", 500)

    direct_vm.clear_mocks()
    _mock_page(direct_vm, URL, "page version 2 - different content, same figures")
    _mock_llm(direct_vm, reserves=100000, liabilities=100000)
    leader_result = json.dumps({"reserves": 100000, "liabilities": 100000, "source_hashes": ["deadbeef"]})
    assert direct_vm.run_validator(leader_result=leader_result) is True

import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
CONTRACT_PATH = ROOT / "contracts" / "PactPilot.py"
OWNER = "0x" + "1" * 40
COUNTERPARTY = "0x" + "2" * 40
OUTSIDER = "0x" + "3" * 40
EVIDENCE_URL = "https://status.example.com/service"


class UserError(Exception):
    pass


class Decorator:
    def __call__(self, value):
        return value


class TreeMap(dict):
    @classmethod
    def __class_getitem__(cls, _item):
        return cls


class Sender:
    as_hex = OWNER


class Message:
    sender_address = Sender()
    value = 0


class Response:
    body = "PactPilot Demo API is operational throughout the sealed observation window."


class FakeWeb:
    calls = 0

    @classmethod
    def get(cls, _url):
        cls.calls += 1
        return Response()


class FakeNondet:
    web = FakeWeb
    semantic_result = "SATISFIED"

    @classmethod
    def exec_prompt(cls, _prompt, response_format=None):
        assert response_format == "json"
        state = cls.semantic_result
        facts = ["Incident detected and service degraded during window"] if state == "BREACHED" else ["The bound service is reported operational"]
        return {
            "scope_relation": "MATCH",
            "coverage": "SUFFICIENT",
            "semantic_state": state,
            "material_facts": facts,
            "rationale": f"The evidence indicates semantic standing is {state}.",
        }


class FakeEqPrinciple:
    @staticmethod
    def prompt_comparative(evaluate, _principle):
        return evaluate()


class FakeRecipient:
    transfers = []

    def __init__(self, address):
        self.address = address

    def emit_transfer(self, value):
        self.transfers.append({"to": self.address, "value": value})


def fake_contract_interface(cls):
    return FakeRecipient


fake_gl = types.SimpleNamespace(
    Contract=object,
    public=types.SimpleNamespace(write=Decorator(), view=Decorator()),
    vm=types.SimpleNamespace(UserError=UserError),
    evm=types.SimpleNamespace(contract_interface=fake_contract_interface),
    message=Message(),
    nondet=FakeNondet,
    eq_principle=FakeEqPrinciple,
)
fake_module = types.ModuleType("genlayer")
fake_module.gl = fake_gl
fake_module.bigint = int
fake_module.u256 = int
fake_module.TreeMap = TreeMap
fake_module.Address = lambda value: value
fake_module.allow_storage = Decorator()
sys.modules["genlayer"] = fake_module

spec = importlib.util.spec_from_file_location("pactpilot_contract_runtime", CONTRACT_PATH)
contract_module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(contract_module)


def new_contract(bond_wei=0, penalty_wei=0, retainer_wei=0):
    contract = contract_module.PactPilot()
    contract.agreements = TreeMap()
    contract.obligations = TreeMap()
    contract.checkpoints = TreeMap()
    contract.obligation_keys = TreeMap()
    contract.checkpoint_keys = TreeMap()
    contract.claimable_balances = TreeMap()
    now = [1_000_000]
    contract._now = lambda: now[0]
    fake_gl.message.sender_address.as_hex = OWNER
    fake_gl.message.value = 0
    FakeWeb.calls = 0
    FakeNondet.semantic_result = "SATISFIED"
    FakeRecipient.transfers.clear()
    agreement_id = contract.register_agreement(
        COUNTERPARTY, "Cloud Services Agreement", "v1", "a" * 64
    )
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    contract.accept_agreement(agreement_id)
    fake_gl.message.sender_address.as_hex = OWNER
    obligation_id = contract.add_obligation(
        agreement_id, "uptime-core", "UPTIME", "Commercial uptime",
        "Maintain commercially reasonable availability during the sealed observation window.",
        "https://status.example.com", EVIDENCE_URL, "PactPilot Demo API", 3600, 300,
        bond_wei, penalty_wei, retainer_wei,
    )
    return contract, now, agreement_id, obligation_id


def test_counterparty_acceptance_binds_all_obligation_terms():
    contract, _now, _agreement_id, obligation_id = new_contract()
    before = json.loads(contract.get_obligation(obligation_id))
    assert before["accepted"] is False
    assert before["obligation_key"] == "uptime-core"
    assert len(before["terms_digest"]) == 64

    fake_gl.message.sender_address.as_hex = OUTSIDER
    with pytest.raises(UserError, match="COUNTERPARTY_ONLY"):
        contract.accept_obligation(obligation_id, before["terms_digest"])

    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    with pytest.raises(UserError, match="TERMS_DIGEST_MISMATCH"):
        contract.accept_obligation(obligation_id, "f" * 64)
    contract.accept_obligation(obligation_id, before["terms_digest"])
    after = json.loads(contract.get_obligation(obligation_id))
    assert after["accepted"] is True
    assert after["accepted_at"] == 1_000_000
    assert after["terms_digest"] == before["terms_digest"]
    with pytest.raises(UserError, match="OBLIGATION_NOT_ACCEPTABLE"):
        contract.accept_obligation(obligation_id, before["terms_digest"])


def test_unaccepted_obligation_cannot_open_checkpoint():
    contract, _now, _agreement_id, obligation_id = new_contract()
    fake_gl.message.sender_address.as_hex = OWNER
    with pytest.raises(UserError, match="OBLIGATION_NOT_ACCEPTED"):
        contract.open_due_checkpoint(obligation_id)
    assert contract.next_checkpoint_id == 0


def test_assessment_is_blocked_until_window_end_before_fetch_or_ai():
    contract, now, _agreement_id, obligation_id = new_contract()
    obligation = json.loads(contract.get_obligation(obligation_id))
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    contract.accept_obligation(obligation_id, obligation["terms_digest"])
    fake_gl.message.sender_address.as_hex = OWNER
    checkpoint_id = contract.open_due_checkpoint(obligation_id)
    checkpoint = json.loads(contract.get_checkpoint(checkpoint_id))
    assert checkpoint["window_start"] == 1_000_000
    assert checkpoint["window_end"] == 1_000_300

    now[0] = 1_000_299
    with pytest.raises(UserError, match="OBSERVATION_WINDOW_OPEN"):
        contract.assess_checkpoint(checkpoint_id)
    assert FakeWeb.calls == 0
    assert json.loads(contract.get_checkpoint(checkpoint_id))["status"] == "OPEN"

    now[0] = 1_000_300
    assert contract.assess_checkpoint(checkpoint_id) == "SATISFIED"
    assert FakeWeb.calls == 1
    assessed = json.loads(contract.get_checkpoint(checkpoint_id))
    assert assessed["status"] == "ASSESSED"
    assert assessed["observed_at"] == 1_000_300


def test_terms_digest_changes_if_any_consequential_policy_field_changes():
    args = [
        "0", OWNER, COUNTERPARTY, "v1", "a" * 64, "uptime-core", "UPTIME", "Commercial uptime",
        "Maintain commercially reasonable availability during the sealed observation window.",
        "https://status.example.com", EVIDENCE_URL, "PactPilot Demo API", 3600, 300,
        1000, 200, 50,
    ]
    baseline = contract_module._obligation_terms_digest(*args)
    for index in range(len(args)):
        changed = list(args)
        changed[index] = changed[index] + 1 if isinstance(changed[index], int) else changed[index] + "-changed"
        assert contract_module._obligation_terms_digest(*changed) != baseline


def test_checkpoint_window_is_anchored_to_scheduled_due_time():
    contract, now, _agreement_id, obligation_id = new_contract()
    obligation = json.loads(contract.get_obligation(obligation_id))
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    contract.accept_obligation(obligation_id, obligation["terms_digest"])
    fake_gl.message.sender_address.as_hex = OWNER

    now[0] = 1_000_080
    checkpoint_id = contract.open_due_checkpoint(obligation_id)
    checkpoint = json.loads(contract.get_checkpoint(checkpoint_id))
    assert checkpoint["window_start"] == 1_000_000
    assert checkpoint["window_end"] == 1_000_300


def test_open_assessments_preserved_on_obligation_closure():
    contract, now, _agreement_id, obligation_id = new_contract()
    obligation = json.loads(contract.get_obligation(obligation_id))
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    contract.accept_obligation(obligation_id, obligation["terms_digest"])
    fake_gl.message.sender_address.as_hex = OWNER

    checkpoint_id = contract.open_due_checkpoint(obligation_id)
    assert json.loads(contract.get_checkpoint(checkpoint_id))["status"] == "OPEN"

    contract.close_obligation(obligation_id)
    assert json.loads(contract.get_obligation(obligation_id))["active"] is False

    now[0] = 1_000_300
    assert contract.assess_checkpoint(checkpoint_id) == "SATISFIED"
    assessed = json.loads(contract.get_checkpoint(checkpoint_id))
    assert assessed["status"] == "ASSESSED"
    assert json.loads(contract.get_obligation(obligation_id))["standing"] == "SATISFIED"


# ==============================================================================
# V3 ESCROW, SOLVENCY & FINANCIAL SETTLEMENT TESTS
# ==============================================================================

def test_v3_deposit_obligation_bond():
    contract, _now, _agreement_id, obligation_id = new_contract(bond_wei=5000, penalty_wei=1000)
    fake_gl.message.sender_address.as_hex = OWNER
    fake_gl.message.value = 5000
    contract.deposit_obligation_bond(obligation_id)

    ob = json.loads(contract.get_obligation(obligation_id))
    assert ob["funded_bond_wei"] == 5000
    assert ob["bond_amount_wei"] == 5000

    report = json.loads(contract.get_solvency_report())
    assert report["total_deposited_wei"] == 5000
    assert report["reserved_bonds_wei"] == 5000
    assert report["is_solvent"] is True


def test_v3_breached_slashes_penalty_and_credits_counterparty():
    contract, now, _agreement_id, obligation_id = new_contract(bond_wei=10_000, penalty_wei=2500)
    ob = json.loads(contract.get_obligation(obligation_id))
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    contract.accept_obligation(obligation_id, ob["terms_digest"])

    fake_gl.message.sender_address.as_hex = OWNER
    fake_gl.message.value = 10_000
    contract.deposit_obligation_bond(obligation_id)

    checkpoint_id = contract.open_due_checkpoint(obligation_id)
    now[0] = 1_000_300

    # Simulate validator consensus returning BREACHED
    FakeNondet.semantic_result = "BREACHED"
    state = contract.assess_checkpoint(checkpoint_id)
    assert state == "BREACHED"

    cp = json.loads(contract.get_checkpoint(checkpoint_id))
    assert cp["settlement_status"] == "REMEDY_CREDITED"
    assert cp["remedy_amount_wei"] == 2500

    # Check that obligation funded bond was reduced by 2500
    ob_after = json.loads(contract.get_obligation(obligation_id))
    assert ob_after["funded_bond_wei"] == 7500

    # Check counterparty claimable balance is now 2500
    claimable = contract.get_claimable_balance(COUNTERPARTY)
    assert claimable == 2500

    # Verify solvency invariant holds: total = reserved + claimable
    report = json.loads(contract.get_solvency_report())
    assert report["total_deposited_wei"] == 10_000
    assert report["reserved_bonds_wei"] == 7500
    assert report["is_solvent"] is True


def test_v3_satisfied_releases_retainer_to_owner():
    contract, now, _agreement_id, obligation_id = new_contract(bond_wei=10_000, penalty_wei=1000, retainer_wei=1500)
    ob = json.loads(contract.get_obligation(obligation_id))
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    contract.accept_obligation(obligation_id, ob["terms_digest"])

    fake_gl.message.sender_address.as_hex = OWNER
    fake_gl.message.value = 10_000
    contract.deposit_obligation_bond(obligation_id)

    checkpoint_id = contract.open_due_checkpoint(obligation_id)
    now[0] = 1_000_300

    FakeNondet.semantic_result = "SATISFIED"
    state = contract.assess_checkpoint(checkpoint_id)
    assert state == "SATISFIED"

    cp = json.loads(contract.get_checkpoint(checkpoint_id))
    assert cp["settlement_status"] == "RETAINER_RELEASED"
    assert cp["remedy_amount_wei"] == 1500

    # Provider gets retainer credited
    owner_balance = contract.get_claimable_balance(OWNER)
    assert owner_balance == 1500


def test_v3_pull_payment_withdrawal():
    contract, now, _agreement_id, obligation_id = new_contract(bond_wei=5000, penalty_wei=2000)
    ob = json.loads(contract.get_obligation(obligation_id))
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    contract.accept_obligation(obligation_id, ob["terms_digest"])

    fake_gl.message.sender_address.as_hex = OWNER
    fake_gl.message.value = 5000
    contract.deposit_obligation_bond(obligation_id)

    checkpoint_id = contract.open_due_checkpoint(obligation_id)
    now[0] = 1_000_300
    FakeNondet.semantic_result = "BREACHED"
    contract.assess_checkpoint(checkpoint_id)

    # Counterparty pulls their 2000 remedy
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    withdrawn = contract.withdraw_balance()
    assert withdrawn == 2000
    assert contract.get_claimable_balance(COUNTERPARTY) == 0

    # Ensure emit_transfer was called
    assert len(FakeRecipient.transfers) == 1
    assert FakeRecipient.transfers[0]["to"] == COUNTERPARTY
    assert FakeRecipient.transfers[0]["value"] == 2000

    # Double withdrawal must fail (zero balance)
    with pytest.raises(UserError, match="ZERO_BALANCE"):
        contract.withdraw_balance()


def test_v3_close_obligation_refunds_unslashed_bond_to_owner():
    contract, _now, _agreement_id, obligation_id = new_contract(bond_wei=8000, penalty_wei=1000)
    fake_gl.message.sender_address.as_hex = OWNER
    fake_gl.message.value = 8000
    contract.deposit_obligation_bond(obligation_id)

    contract.close_obligation(obligation_id)
    ob = json.loads(contract.get_obligation(obligation_id))
    assert ob["active"] is False
    assert ob["funded_bond_wei"] == 0

    # Owner should now have 8000 in claimable balance
    owner_bal = contract.get_claimable_balance(OWNER)
    assert owner_bal == 8000


def test_v3_penalty_exceeding_bond_rejected():
    contract, _now, agreement_id, _obligation_id = new_contract()
    fake_gl.message.sender_address.as_hex = OWNER
    with pytest.raises(UserError, match="PENALTY_EXCEEDS_BOND"):
        contract.add_obligation(
            agreement_id, "bad-bond", "UPTIME", "Title", "Requirement " * 5,
            "https://status.example.com", EVIDENCE_URL, "PactPilot Demo API",
            3600, 300, bond_amount_wei=1000, penalty_per_breach_wei=5000
        )

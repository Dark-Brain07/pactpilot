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

    @staticmethod
    def exec_prompt(_prompt, response_format=None):
        assert response_format == "json"
        return {
            "scope_relation": "MATCH",
            "coverage": "SUFFICIENT",
            "semantic_state": "SATISFIED",
            "material_facts": ["The bound service is reported operational"],
            "rationale": "The evidence supports the bounded uptime obligation.",
        }


class FakeEqPrinciple:
    @staticmethod
    def prompt_comparative(evaluate, _principle):
        return evaluate()


fake_gl = types.SimpleNamespace(
    Contract=object,
    public=types.SimpleNamespace(write=Decorator(), view=Decorator()),
    vm=types.SimpleNamespace(UserError=UserError),
    message=Message(),
    nondet=FakeNondet,
    eq_principle=FakeEqPrinciple,
)
fake_module = types.ModuleType("genlayer")
fake_module.gl = fake_gl
fake_module.bigint = int
fake_module.TreeMap = TreeMap
fake_module.Address = lambda value: value
fake_module.allow_storage = Decorator()
sys.modules["genlayer"] = fake_module

spec = importlib.util.spec_from_file_location("pactpilot_contract_runtime", CONTRACT_PATH)
contract_module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(contract_module)


def new_contract():
    contract = contract_module.PactPilot()
    contract.agreements = TreeMap()
    contract.obligations = TreeMap()
    contract.checkpoints = TreeMap()
    contract.obligation_keys = TreeMap()
    contract.checkpoint_keys = TreeMap()
    now = [1_000_000]
    contract._now = lambda: now[0]
    fake_gl.message.sender_address.as_hex = OWNER
    FakeWeb.calls = 0
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

    # Scheduled due time was 1_000_000. Simulate delayed caller calling at 1_000_080.
    now[0] = 1_000_080
    checkpoint_id = contract.open_due_checkpoint(obligation_id)
    checkpoint = json.loads(contract.get_checkpoint(checkpoint_id))
    assert checkpoint["window_start"] == 1_000_000  # Anchored to scheduled due time!
    assert checkpoint["window_end"] == 1_000_300    # window_seconds = 300


def test_open_assessments_preserved_on_obligation_closure():
    contract, now, _agreement_id, obligation_id = new_contract()
    obligation = json.loads(contract.get_obligation(obligation_id))
    fake_gl.message.sender_address.as_hex = COUNTERPARTY
    contract.accept_obligation(obligation_id, obligation["terms_digest"])
    fake_gl.message.sender_address.as_hex = OWNER

    checkpoint_id = contract.open_due_checkpoint(obligation_id)
    assert json.loads(contract.get_checkpoint(checkpoint_id))["status"] == "OPEN"

    # Owner closes obligation while checkpoint is in-flight
    contract.close_obligation(obligation_id)
    assert json.loads(contract.get_obligation(obligation_id))["active"] is False

    # Once window completes, assess_checkpoint must succeed and preserve standing!
    now[0] = 1_000_300
    assert contract.assess_checkpoint(checkpoint_id) == "SATISFIED"
    assessed = json.loads(contract.get_checkpoint(checkpoint_id))
    assert assessed["status"] == "ASSESSED"
    assert json.loads(contract.get_obligation(obligation_id))["standing"] == "SATISFIED"


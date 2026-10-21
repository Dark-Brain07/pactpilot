import pytest


STATES = ("SATISFIED", "AT_RISK", "BREACHED", "UNRESOLVED")


def derive(scope, coverage, proposed, facts):
    if scope != "MATCH" or coverage != "SUFFICIENT":
        return "UNRESOLVED"
    if proposed == "BREACHED" and not facts:
        raise ValueError("BREACH_REQUIRES_POSITIVE_FACT")
    if proposed not in STATES:
        raise ValueError("INVALID_STATE")
    return proposed


@pytest.mark.parametrize("scope,coverage", [
    ("MISMATCH", "SUFFICIENT"), ("UNKNOWN", "SUFFICIENT"),
    ("MATCH", "PARTIAL"), ("MATCH", "INSUFFICIENT"),
])
def test_inadequate_evidence_cannot_create_positive_state(scope, coverage):
    assert derive(scope, coverage, "SATISFIED", ["claim"]) == "UNRESOLVED"
    assert derive(scope, coverage, "BREACHED", ["claim"]) == "UNRESOLVED"


def test_breach_requires_positive_fact():
    with pytest.raises(ValueError, match="BREACH_REQUIRES_POSITIVE_FACT"):
        derive("MATCH", "SUFFICIENT", "BREACHED", [])


@pytest.mark.parametrize("state", STATES)
def test_closed_state_surface(state):
    facts = ["positive contradictory publication"] if state == "BREACHED" else []
    assert derive("MATCH", "SUFFICIENT", state, facts) == state


# ==============================================================================
# V3 FINANCIAL & SETTLEMENT DECISION INVARIANTS
# ==============================================================================

def calculate_remedy(state, funded_bond, penalty_per_breach):
    """Deterministic settlement math mirroring contract logic."""
    if state == "BREACHED":
        if penalty_per_breach <= 0:
            return 0, funded_bond, "NO_FINANCIAL_PENALTY"
        damage = min(penalty_per_breach, funded_bond)
        if damage > 0:
            return damage, funded_bond - damage, "REMEDY_CREDITED"
        return 0, 0, "BOND_EXHAUSTED"
    elif state == "SATISFIED":
        return 0, funded_bond, "SATISFIED"
    return 0, funded_bond, "FAIL_CLOSED_HOLD"


def test_breach_liquidates_exact_penalty_when_bond_sufficient():
    damage, remaining_bond, status = calculate_remedy("BREACHED", 10_000, 2_000)
    assert damage == 2_000
    assert remaining_bond == 8_000
    assert status == "REMEDY_CREDITED"


def test_breach_clamps_to_remaining_bond_when_insufficient():
    damage, remaining_bond, status = calculate_remedy("BREACHED", 1_500, 2_000)
    assert damage == 1_500
    assert remaining_bond == 0
    assert status == "REMEDY_CREDITED"


def test_exhausted_bond_marks_exhausted_and_no_negative_balance():
    damage, remaining_bond, status = calculate_remedy("BREACHED", 0, 2_000)
    assert damage == 0
    assert remaining_bond == 0
    assert status == "BOND_EXHAUSTED"


def test_unresolved_guarantees_zero_fund_movement():
    damage, remaining_bond, status = calculate_remedy("UNRESOLVED", 5_000, 1_000)
    assert damage == 0
    assert remaining_bond == 5_000
    assert status == "FAIL_CLOSED_HOLD"

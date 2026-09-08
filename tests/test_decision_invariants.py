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

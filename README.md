# PactPilot

PactPilot is a GenLayer temporal commercial assurance primitive. It binds a bounded obligation to an agreement version, counterparty, approved public source and sealed checkpoint schedule. The counterparty separately accepts an immutable digest of the exact obligation, evidence policy and schedule before monitoring begins. Validators independently fetch and interpret evidence; deterministic code controls consent, provenance, lifecycle and standing updates.

## Live Deployment

- **Production App:** [https://pactpilot.vercel.app](https://pactpilot.vercel.app) · [V2 Monitor Console](https://pactpilot.vercel.app/monitor)
- **Network:** GenLayer StudioNet (Chain ID `61999`)
- **Contract Address:** [`0x1e52Df397E8230b598e09c0B55338C51bd5555e4`](https://explorer-studio.genlayer.com/address/0x1e52Df397E8230b598e09c0B55338C51bd5555e4)
- **Explorer Link:** [https://explorer-studio.genlayer.com/address/0x1e52Df397E8230b598e09c0B55338C51bd5555e4](https://explorer-studio.genlayer.com/address/0x1e52Df397E8230b598e09c0B55338C51bd5555e4)
- **Deployer Address:** `0x38bc66E48D6FD45c640230eAA55774BA22773dA1`
- **Deploy Transaction Hash:** [`0x3e1275cf48be8a5bfd3e978fe39833bbaaa6350ececa0f63719c19416dabc626`](https://explorer-studio.genlayer.com/tx/0x3e1275cf48be8a5bfd3e978fe39833bbaaa6350ececa0f63719c19416dabc626)
- **Live Verification Transaction (`register_agreement`):** [`0xd1253b3e8b1c6e1dc13ad6801cd70732c178de7df5acb082f9d7e5824ad406d2`](https://explorer-studio.genlayer.com/tx/0xd1253b3e8b1c6e1dc13ad6801cd70732c178de7df5acb082f9d7e5824ad406d2)

---

## Why GenLayer

External publications often express incidents, certification scope and operational status in unstructured language. The consequential semantic question cannot be reduced to a stable numeric oracle, while source authority, timestamps and lifecycle remain deterministic contract rules.

PactPilot uses GenLayer's built-in non-deterministic LLM execution and Web connectivity:
- Independent validator nodes fetch the approved public evidence source (`gl.nondet.web.get`).
- Evaluators check whether the evidence refers to the bound object and whether it supports, warns about, or contradicts the obligation.
- Consensus is reached via the comparative equivalence principle (`gl.eq_principle.prompt_comparative`).
- If evidence is unavailable, malformed, or ambiguous, the contract deterministically marks the checkpoint `UNRESOLVED` rather than fabricating a breach.

---

## Safe MVP Boundary

- **Monitoring registry, not a dispute court:** Records observational standing over time.
- **No custody or automatic damages:** Operates without fund locks, penalties, or escrow.
- **Explicit keeper triggers:** Keepers open due checkpoints after each cadence interval; no autonomous execution is assumed.
- **Fail-closed evidence:** Missing or inadequate evidence yields `UNRESOLVED`, never `BREACHED`. A breach requires explicit contradictory evidence.
- **Privacy preserving:** No private agreement documents or sensitive text are placed on-chain.

---

## Public Methods

### Writes
- `register_agreement(counterparty, name, version, clause_digest)`: Register a new agreement version and digest.
- `accept_agreement(agreement_id)`: Counterparty accepts the agreement terms.
- `add_obligation(agreement_id, obligation_key, kind, title, requirement, authority_origin, evidence_url, object_marker, cadence_seconds, window_seconds)`: Add an obligation to an accepted agreement.
- `accept_obligation(obligation_id, expected_terms_digest)`: Counterparty accepts the exact immutable terms digest.
- `open_due_checkpoint(obligation_id)`: Open a checkpoint when due.
- `assess_checkpoint(checkpoint_id)`: Run validator consensus to judge public evidence after the window closes.
- `close_obligation(obligation_id)`: Close an active obligation.

### Views
- `get_contract_version()`: Returns contract metadata and consent schema version (`{"name": "PactPilot", "version": 2, "consent_schema": "exact-obligation-digest"}`).
- `get_agreement(agreement_id)`: Returns agreement state and accepted status.
- `get_obligation(obligation_id)`: Returns obligation configuration, terms digest, and current standing.
- `get_checkpoint(checkpoint_id)`: Returns checkpoint assessment results, material facts, and rationale.
- `get_totals()`: Returns counts of registered agreements, obligations, and checkpoints.

---

## Local Verification & Testing

Run the full automated test suite and linter:

```powershell
# 1. Run Python unit and mock runtime tests (23 tests)
python -m pytest tests -q

# 2. Run GenVM AST and semantic validation
$env:PYTHONUTF8='1'
genvm-lint check contracts\PactPilot.py

# 3. Run client & receipt TypeScript tests (8 tests)
npm test

# 4. Run Next.js production build
npm run build
```

---

## Running the Web Application

```powershell
# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the landing page, or [http://localhost:3000/monitor](http://localhost:3000/monitor) to open the interactive obligation console.

# PactPilot

PactPilot is a GenLayer temporal commercial assurance primitive. It binds a bounded obligation to an agreement version, counterparty, approved public source and sealed checkpoint schedule. The counterparty separately accepts an immutable digest of the exact obligation, evidence policy and schedule before monitoring begins. Validators independently fetch and interpret evidence; deterministic code controls consent, provenance, lifecycle and standing updates.

## Live Deployment

- **Production App:** [https://pactpilot.vercel.app](https://pactpilot.vercel.app) · [V2 Monitor Console](https://pactpilot.vercel.app/monitor)
- **Network:** GenLayer StudioNet (Chain ID `61999`)
- **Contract Address:** [`0xC458777c0fb0854578f94179498280F3EFE5917A`](https://explorer-studio.genlayer.com/address/0xC458777c0fb0854578f94179498280F3EFE5917A)
- **Explorer Link:** [https://explorer-studio.genlayer.com/address/0xC458777c0fb0854578f94179498280F3EFE5917A](https://explorer-studio.genlayer.com/address/0xC458777c0fb0854578f94179498280F3EFE5917A)
- **Deployer Address:** `0x043430585c0761EDB66CCDe9DD71fD5a56421B87`
- **Deploy Transaction Hash:** [`0x0489b9bec16455a7da743a89543acbd665671cabb09248f7c9c7eecd96edba80`](https://explorer-studio.genlayer.com/tx/0x0489b9bec16455a7da743a89543acbd665671cabb09248f7c9c7eecd96edba80)
- **Live Verified Transactions on StudioNet:**
  - **Register Agreement:** [`0x0733b8b93d4edec49f9ceb003c012fdab57ea2acd079df6402a334d73200f4e0`](https://explorer-studio.genlayer.com/tx/0x0733b8b93d4edec49f9ceb003c012fdab57ea2acd079df6402a334d73200f4e0)
  - **Accept Agreement (Counterparty):** [`0xdb12ae6100157d1af5f05c36075a7b5ef0aaddf86beaed6a1c4036a7a84575a1`](https://explorer-studio.genlayer.com/tx/0xdb12ae6100157d1af5f05c36075a7b5ef0aaddf86beaed6a1c4036a7a84575a1)
  - **Add Obligation (Owner):** [`0x3a5cc65d50312db6c8e95d5a1d4e4f499a79721288c84c1c328a0e8dd19c9a9e`](https://explorer-studio.genlayer.com/tx/0x3a5cc65d50312db6c8e95d5a1d4e4f499a79721288c84c1c328a0e8dd19c9a9e)
  - **Accept Terms Digest (Counterparty):** [`0x4e97c7f2fde852e798a85df17c86767c31796b628f39d987904f3e078ba5eca1`](https://explorer-studio.genlayer.com/tx/0x4e97c7f2fde852e798a85df17c86767c31796b628f39d987904f3e078ba5eca1)
  - **Open Anchored Checkpoint:** [`0xdffc8a9d784033bc3266d2efaf736f33f00346a17a386fd89614d7be826d26d8`](https://explorer-studio.genlayer.com/tx/0xdffc8a9d784033bc3266d2efaf736f33f00346a17a386fd89614d7be826d26d8)

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

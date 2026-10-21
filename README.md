# PactPilot V3: Bonded SLA Escrow & Autonomous Financial Remediation

PactPilot is a GenLayer commercial assurance and trustless SLA settlement protocol. It binds temporal service obligations to agreement versions, counterparties, approved public evidence sources, and **1:1 solvent on-chain performance bonds**. 

Counterparties cryptographically verify and accept an immutable terms digest before monitoring begins. When sealed observation windows elapse, independent GenVM validators evaluate public web evidence via LLM consensus (`gl.eq_principle.prompt_comparative`). If an SLA breach is proven, liquidated damages are deterministically deducted from the provider's bond and credited to the counterparty, available for immediate non-custodial pull-payment withdrawal.

---

## Live Deployment (GenLayer StudioNet)

- **Production App:** [https://pactpilot.vercel.app](https://pactpilot.vercel.app) · [SLA Escrow Console](https://pactpilot.vercel.app/monitor)
- **Network:** GenLayer StudioNet (Chain ID `61999`)
- **V3 Intelligent Contract:** [`0x54788Cf3aFA14be81121208BdC64FBA320CA16A9`](https://explorer-studio.genlayer.com/address/0x54788Cf3aFA14be81121208BdC64FBA320CA16A9)
- **Explorer Link:** [https://explorer-studio.genlayer.com/address/0x54788Cf3aFA14be81121208BdC64FBA320CA16A9](https://explorer-studio.genlayer.com/address/0x54788Cf3aFA14be81121208BdC64FBA320CA16A9)
- **Deployer Address:** `0xA1052aaD9057D28d48cfe619CC56AB3454EEc81D`
- **Deploy Transaction Hash:** [`0xba6af2079bb18db133600db0fda8eaa3f916b8ee3c49e92128b112b6b1b12e3c`](https://explorer-studio.genlayer.com/tx/0xba6af2079bb18db133600db0fda8eaa3f916b8ee3c49e92128b112b6b1b12e3c)

### Verified V3 On-Chain Lifecycle Transactions (100% Validator Consensus)

| Lifecycle Stage | Transaction Hash | StudioNet Explorer Proof |
| :--- | :--- | :--- |
| **Contract Deployment (V3)** | `0xba6af2079bb18db133600db0fda8eaa3f916b8ee3c49e92128b112b6b1b12e3c` | [View Deployment Tx](https://explorer-studio.genlayer.com/tx/0xba6af2079bb18db133600db0fda8eaa3f916b8ee3c49e92128b112b6b1b12e3c) |
| **1. Register Agreement** | `0xc6a05e2eb535984ddb36cfcf6e7634ac180d2f7038cf91de2976e21576cfb5e6` | [View Register Tx](https://explorer-studio.genlayer.com/tx/0xc6a05e2eb535984ddb36cfcf6e7634ac180d2f7038cf91de2976e21576cfb5e6) |
| **2. Accept Agreement (Counterparty)** | `0xbf794041c8fce9a5d4706b92b930d807d6567d1c9fe11bfbee4b3b0fd4562079` | [View Accept Tx](https://explorer-studio.genlayer.com/tx/0xbf794041c8fce9a5d4706b92b930d807d6567d1c9fe11bfbee4b3b0fd4562079) |
| **3. Add Obligation with SLA Terms** | `0x05fb7a95f44ada5979621502bd80e691d7e0ff37f755bd83a03243b90e522a5a` | [View Obligation Tx](https://explorer-studio.genlayer.com/tx/0x05fb7a95f44ada5979621502bd80e691d7e0ff37f755bd83a03243b90e522a5a) |
| **4. Accept Obligation Terms Digest** | `0x08f24abee08cb588e776606f26dd844ef36d7c687f306eb9eb0c73bdec27774f` | [View Terms Consent Tx](https://explorer-studio.genlayer.com/tx/0x08f24abee08cb588e776606f26dd844ef36d7c687f306eb9eb0c73bdec27774f) |
| **5. Deposit SLA Bond (Escrow Lock)** | `0xef25443cead69af8b02ea3458a8494f33e7b88e0088fbcd29b0989bf78212fbf` | [View Escrow Deposit Tx](https://explorer-studio.genlayer.com/tx/0xef25443cead69af8b02ea3458a8494f33e7b88e0088fbcd29b0989bf78212fbf) |

On-chain solvency report verified via `get_solvency_report()`:
```json
{
  "is_solvent": true,
  "reserved_bonds_wei": 5000,
  "total_deposited_wei": 5000
}
```

---

## What Changed in V3 (The Milestone Delta)

PactPilot V2 was intentionally scoped as an observational monitoring registry with *no custody, no collateral, and no automated damages*. 

**PactPilot V3 transforms this into a full economic assurance and solvent remediation protocol:**

1. **Bonded SLA Escrow (`deposit_obligation_bond`)**: Service providers lock GEN performance collateral on-chain to back their availability or certification commitments.
2. **Strict 1:1 Solvency Accounting**: Invariant `total_deposited_wei >= reserved_bonds_wei` guarantees the contract is solvent at all times, preventing over-allocation or drain attacks.
3. **Autonomous AI-Settled Financial Remediation**:
   - **`BREACHED`**: Contract automatically slashes liquidated damages from the provider's bond and credits them to the counterparty's claimable balance.
   - **`SATISFIED`**: Periodic retainer fee is unlocked to the provider.
   - **`UNRESOLVED`**: Fail-closed protection holds all funds intact without false slashes.
4. **Non-Custodial Pull-Payment Pattern (`withdraw_balance`)**: Credited damages and retainers are claimed via direct pull-payments routed through the GenVM EVM bridge (`_send_gen`), eliminating reentrancy and out-of-gas risks.
5. **New Interactive Workspace**: The frontend monitor console now includes an interactive **SLA Escrow & Solvency Vault** card to fund bonds, inspect real-time solvency ratios, and withdraw remedies in one click.

---

## Public Methods

### Writes
- `register_agreement(counterparty, name, version, clause_digest)`: Register a new agreement version and digest.
- `accept_agreement(agreement_id)`: Counterparty accepts the agreement terms.
- `add_obligation(agreement_id, obligation_key, kind, title, requirement, authority_origin, evidence_url, object_marker, cadence_seconds, window_seconds, bond_amount_wei, penalty_per_breach_wei, retainer_payout_wei)`: Add an obligation with bound SLA financial terms.
- `accept_obligation(obligation_id, expected_terms_digest)`: Counterparty accepts exact terms and bond digest.
- `deposit_obligation_bond(obligation_id, amount_wei)`: Service provider funds performance collateral into escrow.
- `open_due_checkpoint(obligation_id)`: Open a checkpoint when due.
- `assess_checkpoint(checkpoint_id)`: Independent GenVM validators reach consensus on evidence; triggers automatic financial settlement.
- `withdraw_balance()`: Non-custodial pull-payment withdrawal of credited remedies or retainers.
- `close_obligation(obligation_id)`: Closes obligation and refunds remaining unslashed bond to owner.

### Views
- `get_contract_version()`: Returns metadata (`{"name": "PactPilot", "version": 3, "consent_schema": "exact-obligation-digest", "financial_engine": "solvent-sla-escrow"}`).
- `get_solvency_report()`: Returns total deposited, reserved bonds, and mathematical solvency verification.
- `get_claimable_balance(account)`: Returns user's withdrawable balance in wei.
- `get_agreement(agreement_id)`: Agreement details and acceptance status.
- `get_obligation(obligation_id)`: Obligation terms, bonded collateral, and standing.
- `get_checkpoint(checkpoint_id)`: Checkpoint status, evidence hash, facts, and settlement status.
- `get_totals()`: Aggregated counts and contract escrow balances.

---

## Local Verification & Testing

```powershell
# 1. Run Python test suite (35 automated unit & invariant tests)
python -m pytest tests -q

# 2. Run GenVM AST linter
$env:PYTHONUTF8='1'
genvm-lint check contracts\PactPilot.py --json

# 3. Run client TypeScript tests (8 tests)
npm test

# 4. Run Next.js production build
npm run build
```

---

## Running the Web Application

```powershell
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the landing page or [http://localhost:3000/monitor](http://localhost:3000/monitor) for the interactive Obligation & SLA Escrow Console.

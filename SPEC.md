# PactPilot V3 Specification

## Proof Obligation

For one bounded commercial obligation, agreement version, counterparty and sealed checkpoint window, determine whether approved public evidence sufficiently supports `SATISFIED`, `AT_RISK`, `BREACHED` or `UNRESOLVED`.

PactPilot adjudicates compliance against bound authority sources and executes autonomous economic settlement from locked SLA performance bonds without centralized custody or discretion.

## Architecture

1. **Agreement Consent**: Owner registers agreement name, version, and clause digest; counterparty explicitly accepts on-chain.
2. **Obligation & SLA Terms**: Owner defines schedule, evidence origin, object marker, SLA performance bond, breach penalty, and retainer payout. The contract hashes all terms into an immutable `terms_digest`.
3. **Mutual Consent Binding**: Counterparty verifies and submits the exact terms digest before any checkpoint or escrow activation can occur.
4. **1:1 Solvent Bond Escrow**: Service provider deposits GEN collateral into the contract. Strict invariants (`total_deposited_wei >= reserved_bonds_wei`) guarantee solvency.
5. **Decentralized Machine Adjudication**: After the sealed observation window ends, GenVM validators independently fetch the authorized URL and evaluate semantic standing via comparative consensus (`gl.eq_principle.prompt_comparative`).
6. **Autonomous Financial Settlement**:
   - `BREACHED`: Contract deterministically liquidates breach penalty from provider's bond and credits counterparty's claimable balance.
   - `SATISFIED`: Retainer reward is credited to provider.
   - `UNRESOLVED`: Fail-closed capital preservation holds all funds safe.
7. **Non-Custodial Pull-Payments**: Beneficiaries claim funds directly to their wallet via `withdraw_balance()`.

## State Model

- **Agreement**: `owner`, `counterparty`, `name`, `version`, `clause_digest`, `accepted`, `active`.
- **Obligation**: `terms_digest`, `cadence_seconds`, `window_seconds`, `bond_amount_wei`, `funded_bond_wei`, `penalty_per_breach_wei`, `retainer_payout_wei`, `standing`.
- **Checkpoint**: `status` (`OPEN`, `ASSESSED`, `UNRESOLVED`), `semantic_state`, `settlement_status`, `remedy_amount_wei`.
- **Escrow Accounting**: `total_deposited_wei`, `reserved_bonds_wei`, `claimable_balances` (address -> wei).

## Evolution from V2 MVP

- **V2 Limitation**: In V2, PactPilot was purely an observational registry without custody, bonds, or damages.
- **V3 Breakthrough**: V3 introduces autonomous bonded SLA escrow, 1:1 solvency invariants, deterministic liquidated damage slashing, and pull-payment claims.

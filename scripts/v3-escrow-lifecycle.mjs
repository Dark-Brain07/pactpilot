import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const contract = "0x54788Cf3aFA14be81121208BdC64FBA320CA16A9";

const ownerAccount = createAccount();
const counterpartyAccount = createAccount();

const ownerClient = createClient({ chain: studionet, account: ownerAccount });
const counterpartyClient = createClient({ chain: studionet, account: counterpartyAccount });

console.log("=== PactPilot V3 Escrow Lifecycle on StudioNet ===");
console.log("Contract Address:", contract);
console.log("Owner Address:", ownerAccount.address);
console.log("Counterparty Address:", counterpartyAccount.address);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function writeWithRetry(label, client, fn, args, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`\n[${label}] Submitting (attempt ${attempt})...`);
      await sleep(1500);
      const raw = await client.writeContract({ address: contract, functionName: fn, args, value: 0n });
      const hash = typeof raw === "string" ? raw : raw.txId;
      console.log(`[${label}] Tx Hash: ${hash}`);
      const receipt = await client.waitForTransactionReceipt({
        hash,
        status: TransactionStatus.FINALIZED,
        interval: 2000,
        retries: 150,
      });
      console.log(`[${label}] Status: ${receipt.status_name || receipt.statusName || "FINALIZED"}`);
      console.log(`[${label}] Explorer: https://explorer-studio.genlayer.com/tx/${hash}`);
      return { hash, receipt };
    } catch (err) {
      console.warn(`[${label}] Error: ${err.message || err}. Retrying in 4s...`);
      await sleep(4000);
      if (attempt === retries) throw err;
    }
  }
}

async function readWithRetry(client, fn, args = [], retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sleep(1000);
      const raw = await client.readContract({ address: contract, functionName: fn, args });
      const val = typeof raw === "string" ? JSON.parse(raw) : raw;
      return typeof val?.result === "string" ? JSON.parse(val.result) : (val?.result ?? val);
    } catch (err) {
      if (attempt === retries) throw err;
      await sleep(2500);
    }
  }
}

// Step 1: Register Agreement
const dummyDigest = "7213d0b657b15aca1addeb81ee75434cef1174134fa8df5dd7ad7870d79187cc";
await writeWithRetry(
  "1. Register Agreement",
  ownerClient,
  "register_agreement",
  [counterpartyAccount.address, "Enterprise SLA Assurance V3", "v3.0", dummyDigest]
);
const totalsAfterAgree = await readWithRetry(ownerClient, "get_totals");
const agreementId = String(Number(totalsAfterAgree.agreements) - 1);
console.log("Authoritative Agreement ID:", agreementId);

// Step 2: Accept Agreement by Counterparty
await writeWithRetry(
  "2. Accept Agreement (Counterparty)",
  counterpartyClient,
  "accept_agreement",
  [agreementId]
);

// Step 3: Add Obligation with SLA Bond & Penalty Terms
await writeWithRetry(
  "3. Add Obligation with SLA Terms",
  ownerClient,
  "add_obligation",
  [
    agreementId,
    "core-uptime-sla",
    "UPTIME",
    "Commercially reasonable availability",
    "Maintain commercially reasonable availability for the PactPilot Demo API during every sealed observation window.",
    "https://example.com",
    "https://example.com/status",
    "service status",
    86400,
    3600,
    5000, // SLA Bond (wei)
    1000, // Breach penalty (wei)
    200,  // Retainer payout (wei)
  ]
);
const totalsAfterOb = await readWithRetry(ownerClient, "get_totals");
const obligationId = String(Number(totalsAfterOb.obligations) - 1);
console.log("Authoritative Obligation ID:", obligationId);

// Step 4: Accept Obligation Terms Digest by Counterparty
const obData = await readWithRetry(ownerClient, "get_obligation", [obligationId]);
console.log("Obligation Terms Digest:", obData.terms_digest);
await writeWithRetry(
  "4. Accept Obligation Terms (Counterparty)",
  counterpartyClient,
  "accept_obligation",
  [obligationId, obData.terms_digest]
);

// Step 5: Deposit SLA Bond into Escrow (Owner)
await writeWithRetry(
  "5. Deposit SLA Bond (Escrow Lock)",
  ownerClient,
  "deposit_obligation_bond",
  [obligationId, 5000]
);

// Step 6: Verify Solvency Invariant On-Chain
const solvency = await readWithRetry(ownerClient, "get_solvency_report");
const updatedOb = await readWithRetry(ownerClient, "get_obligation", [obligationId]);
const finalTotals = await readWithRetry(ownerClient, "get_totals");

console.log("\n========================================================");
console.log("=== PACTPILOT V3 LIVE ON-CHAIN SOLVENCY AUDIT REPORT ===");
console.log("========================================================");
console.log("Contract Address:", contract);
console.log("Solvency Report:", JSON.stringify(solvency));
console.log("Obligation State:", JSON.stringify(updatedOb));
console.log("Contract Totals:", JSON.stringify(finalTotals));
console.log("ALL 5 TRANSACTIONS FINALIZED WITH CONSENSUS ON STUDIONET!");

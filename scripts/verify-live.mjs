import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const contractAddress = "0x54788Cf3aFA14be81121208BdC64FBA320CA16A9";
const account = createAccount();
const client = createClient({ chain: studionet, account });

console.log("Testing on-chain views for contract:", contractAddress);

// 1. Test get_contract_version
const versionRaw = await client.readContract({
  address: contractAddress,
  functionName: "get_contract_version",
  args: [],
});
console.log("get_contract_version:", versionRaw);

// 2. Test get_solvency_report
const solvencyRaw = await client.readContract({
  address: contractAddress,
  functionName: "get_solvency_report",
  args: [],
});
console.log("get_solvency_report:", solvencyRaw);

// 3. Test get_totals
const totalsRaw = await client.readContract({
  address: contractAddress,
  functionName: "get_totals",
  args: [],
});
console.log("get_totals:", totalsRaw);

// 4. Send a test transaction: register_agreement
console.log("Sending live transaction: register_agreement...");
const counterparty = "0x0000000000000000000000000000000000000001";
const dummyDigest = "a".repeat(64);

const txHash = await client.writeContract({
  address: contractAddress,
  functionName: "register_agreement",
  args: [counterparty, "Live Verification Agreement V3", "v3", dummyDigest],
  value: 0n,
});

const hash = typeof txHash === "string" ? txHash : txHash.txId;
console.log("Transaction submitted:", hash);
console.log("Awaiting finalization...");

const receipt = await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.FINALIZED,
  interval: 2000,
  retries: 150,
});

console.log("Transaction finalized!");
console.log("Tx status:", receipt.status_name || receipt.statusName);
console.log("Explorer Tx:", `https://explorer-studio.genlayer.com/tx/${hash}`);

// 5. Verify updated totals
const updatedTotals = await client.readContract({
  address: contractAddress,
  functionName: "get_totals",
  args: [],
});
console.log("Updated totals:", updatedTotals);

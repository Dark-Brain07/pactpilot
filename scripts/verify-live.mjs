import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const contractAddress = "0x1e52Df397E8230b598e09c0B55338C51bd5555e4";
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

// 2. Test get_totals
const totalsRaw = await client.readContract({
  address: contractAddress,
  functionName: "get_totals",
  args: [],
});
console.log("get_totals:", totalsRaw);

// 3. Send a test transaction: register_agreement
console.log("Sending live transaction: register_agreement...");
const counterparty = "0x0000000000000000000000000000000000000001";
const dummyDigest = "a".repeat(64);

const txHash = await client.writeContract({
  address: contractAddress,
  functionName: "register_agreement",
  args: [counterparty, "Live Verification Agreement", "v1", dummyDigest],
  value: 0n,
});

console.log("Transaction submitted:", txHash);
console.log("Awaiting finalization...");

const receipt = await client.waitForTransactionReceipt({
  hash: typeof txHash === "string" ? txHash : txHash.txId,
  status: TransactionStatus.FINALIZED,
  interval: 2000,
  retries: 150,
});

console.log("Transaction finalized!");
console.log("Tx status:", receipt.status_name || receipt.statusName);

// 4. Verify updated totals
const updatedTotals = await client.readContract({
  address: contractAddress,
  functionName: "get_totals",
  args: [],
});
console.log("Updated totals:", updatedTotals);

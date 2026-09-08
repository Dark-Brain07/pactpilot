import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { transactionResultNumberToName } from "genlayer-js/types";

const contract = process.env.PACTPILOT_CONTRACT_ADDRESS?.trim();
let rawKey = process.env.PACTPILOT_ATTACKER_PRIVATE_KEY?.trim() || "";
if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract)) throw new Error("Missing/invalid PACTPILOT_CONTRACT_ADDRESS");
async function readSecretLine() {
  if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume(); let value = "";
  for await (const chunk of process.stdin) {
    for (const character of String(chunk)) {
      if (character === "\r" || character === "\n") { if (value) { if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false); return value.trim(); } }
      else value += character;
    }
  }
  return value.trim();
}
if (!rawKey) rawKey = await readSecretLine();
if (!rawKey) throw new Error("Pass attacker private key as stdin");
const account = createAccount(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
rawKey = "";
const client = createClient({ chain: studionet, account });

async function read(functionName, args = []) {
  const raw = await client.readContract({ address: contract, functionName, args });
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return typeof value?.result === "string" ? JSON.parse(value.result) : (value?.result ?? value);
}

function rollbackReason(transaction) {
  const leader = transaction?.consensus_data?.leader_receipt?.[0];
  const execution = String(leader?.execution_result ?? "").toUpperCase();
  const resultStatus = String(leader?.result?.status ?? "").toUpperCase();
  const consensusResult = String(transaction?.resultName ?? transactionResultNumberToName?.[String(transaction?.result)] ?? "").toUpperCase();
  if (execution && execution !== "SUCCESS") return String(leader?.result?.payload?.readable ?? leader?.result?.payload ?? leader?.error_description ?? execution);
  if (["ROLLBACK", "ERROR", "FAILED"].some((part) => resultStatus.includes(part))) return String(leader?.result?.payload?.readable ?? leader?.result?.payload ?? resultStatus);
  if (consensusResult && !["AGREE", "MAJORITY_AGREE"].includes(consensusResult)) return `consensus result ${consensusResult}`;
  return "";
}

async function expectRollback(label, functionName, args) {
  const before = await read("get_totals");
  const hash = await client.writeContract({ address: contract, functionName, args, value: 0n });
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 2000, retries: 300 });
  let transaction = receipt; try { transaction = await client.getTransaction({ hash }); } catch {}
  const reason = rollbackReason(transaction);
  if (!reason) throw new Error(`${label}: expected rollback`);
  const after = await read("get_totals");
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error(`${label}: rejected write mutated totals`);
  return { label, hash, reason, before, after };
}

const results = [];
results.push(await expectRollback("invalid_counterparty", "register_agreement", [account.address, "Self dealing agreement", "v1", "a".repeat(64)]));
results.push(await expectRollback("invalid_digest", "register_agreement", ["0x0000000000000000000000000000000000000001", "Malformed digest agreement", "v1", "not-a-digest"]));
results.push(await expectRollback("unknown_obligation", "open_due_checkpoint", ["999999999"]));
process.stdout.write(`FAILURE_CONTROLS_COMPLETE ${JSON.stringify({ contract, results }, null, 2)}\n`);

import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { transactionResultNumberToName } from "genlayer-js/types";
import { decodeReturnedId } from "../lib/receipt.ts";

const contract = process.env.PACTPILOT_CONTRACT_ADDRESS?.trim();
let rawKey = process.env.PACTPILOT_OWNER_PRIVATE_KEY?.trim() || "";
let counterpartyKey = process.env.PACTPILOT_COUNTERPARTY_PRIVATE_KEY?.trim() || "";
const evidenceUrl = process.env.PACTPILOT_EVIDENCE_URL?.trim();
const expectedState = (process.env.PACTPILOT_EXPECTED_STATE || "SATISFIED").trim().toUpperCase();
const objectMarker = process.env.PACTPILOT_OBJECT_MARKER?.trim() || "PactPilot Demo API";
const windowSeconds = Number(process.env.PACTPILOT_WINDOW_SECONDS || "300");
if (!contract || !/^0x[0-9a-fA-F]{40}$/.test(contract)) throw new Error("Missing/invalid PACTPILOT_CONTRACT_ADDRESS");
if (!evidenceUrl || !/^https:\/\//.test(evidenceUrl)) throw new Error("Evidence URL must be HTTPS");
if (!["SATISFIED", "AT_RISK", "BREACHED", "UNRESOLVED"].includes(expectedState)) throw new Error("Invalid PACTPILOT_EXPECTED_STATE");
if (!Number.isInteger(windowSeconds) || windowSeconds < 300) throw new Error("PACTPILOT_WINDOW_SECONDS must be an integer >= 300");

async function readSecretLines(count) {
  if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(true);
  process.stdin.resume();
  const values = []; let value = "";
  for await (const chunk of process.stdin) {
    for (const character of String(chunk)) {
      if (character === "\r" || character === "\n") {
        if (value) { values.push(value.trim()); value = ""; if (values.length === count) { if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false); return values; } }
      } else value += character;
    }
  }
  if (process.stdin.isTTY && process.stdin.setRawMode) process.stdin.setRawMode(false);
  return values;
}

if (!rawKey || !counterpartyKey) {
  const keys = await readSecretLines(2);
  if (keys.length !== 2) throw new Error("Pass owner and counterparty private keys as two stdin lines");
  rawKey = keys[0]; counterpartyKey = keys[1]; keys.fill("");
}

const origin = new URL(evidenceUrl).origin;
const account = createAccount(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`);
const client = createClient({ chain: studionet, account });
const counterpartyAccount = createAccount(counterpartyKey.startsWith("0x") ? counterpartyKey : `0x${counterpartyKey}`);
const counterpartyClient = createClient({ chain: studionet, account: counterpartyAccount });
const counterparty = counterpartyAccount.address;
rawKey = ""; counterpartyKey = "";
const clauseDigest = process.env.PACTPILOT_CLAUSE_DIGEST || "7213d0b657b15aca1addeb81ee75434cef1174134fa8df5dd7ad7870d79187cc";

function transactionFailure(transaction, receipt) {
  const leader = transaction?.consensus_data?.leader_receipt?.[0];
  const execution = String(leader?.execution_result ?? "").toUpperCase();
  const resultStatus = String(leader?.result?.status ?? "").toUpperCase();
  const finalized = String(transaction?.statusName ?? receipt?.statusName ?? "").toUpperCase();
  const consensusResult = String(transaction?.resultName ?? transactionResultNumberToName?.[String(transaction?.result)] ?? "").toUpperCase();
  if (execution && execution !== "SUCCESS") return String(leader?.result?.payload?.readable ?? leader?.error_description ?? execution);
  if (["ROLLBACK", "ERROR", "FAILED"].some((part) => resultStatus.includes(part))) return String(leader?.result?.payload?.readable ?? leader?.error_description ?? resultStatus);
  if (finalized && finalized !== "FINALIZED") return `unexpected transaction status ${finalized}`;
  if (consensusResult && !["AGREE", "MAJORITY_AGREE"].includes(consensusResult)) return `consensus result ${consensusResult}`;
  return "";
}

async function write(label, functionName, args, writer = client) {
  const hash = await writer.writeContract({ address: contract, functionName, args, value: 0n });
  process.stdout.write(`${label}: submitted ${hash}\n`);
  const receipt = await writer.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 2000, retries: 300 });
  let transaction = receipt;
  try { transaction = await writer.getTransaction({ hash }); } catch { /* receipt remains authoritative fallback */ }
  const rejected = transactionFailure(transaction, receipt);
  if (rejected) throw new Error(`${label}: ${rejected}`);
  const record = { label, hash, receipt, transaction };
  process.stdout.write(`${label}: FINALIZED\n`);
  return record;
}

async function expectRollback(label, functionName, args, writer = client) {
  const hash = await writer.writeContract({ address: contract, functionName, args, value: 0n });
  process.stdout.write(`${label}: submitted ${hash}\n`);
  const receipt = await writer.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 2000, retries: 300 });
  let transaction = receipt;
  try { transaction = await writer.getTransaction({ hash }); } catch { /* receipt remains authoritative fallback */ }
  const reason = transactionFailure(transaction, receipt);
  if (!reason) throw new Error(`${label}: expected rollback but write succeeded`);
  process.stdout.write(`${label}: FINALIZED rollback (${reason})\n`);
  return { label, hash, reason };
}

async function read(functionName, args = []) {
  const raw = await client.readContract({ address: contract, functionName, args });
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return typeof value?.result === "string" ? JSON.parse(value.result) : (value?.result ?? value);
}

const initial = await read("get_totals");
const resumeAgreementId = process.env.PACTPILOT_RESUME_AGREEMENT_ID?.trim();
const resumeObligationId = process.env.PACTPILOT_RESUME_OBLIGATION_ID?.trim();
const resumeCheckpointId = process.env.PACTPILOT_RESUME_CHECKPOINT_ID?.trim();
const agreementTx = resumeAgreementId === undefined
  ? await write("register_agreement", "register_agreement", [counterparty, "PactPilot Demonstration Agreement", "v1", clauseDigest])
  : null;
const agreementId = agreementTx ? decodeReturnedId(agreementTx.transaction, agreementTx.receipt) : resumeAgreementId;
const acceptTx = resumeObligationId === undefined ? await write("accept_agreement", "accept_agreement", [agreementId], counterpartyClient) : null;
const obligationTx = resumeObligationId === undefined ? await write("add_obligation", "add_obligation", [
  agreementId, `demo-${expectedState.toLowerCase()}`, "UPTIME", "Commercially reasonable uptime",
  "Maintain commercially reasonable availability for the PactPilot Demo API during every sealed observation window.",
  origin, evidenceUrl, objectMarker, 86400, windowSeconds,
]) : null;
const obligationId = obligationTx ? decodeReturnedId(obligationTx.transaction, obligationTx.receipt) : resumeObligationId;
const obligationBeforeConsent = await read("get_obligation", [obligationId]);
const wrongDigest = `${obligationBeforeConsent.terms_digest[0] === "f" ? "e" : "f"}${obligationBeforeConsent.terms_digest.slice(1)}`;
const mismatchedConsentControl = obligationBeforeConsent.accepted
  ? null
  : await expectRollback("accept_obligation_mismatched_digest", "accept_obligation", [obligationId, wrongDigest], counterpartyClient);
if (mismatchedConsentControl) {
  const afterMismatch = await read("get_obligation", [obligationId]);
  if (JSON.stringify(afterMismatch) !== JSON.stringify(obligationBeforeConsent)) throw new Error("Mismatched digest rollback mutated obligation state");
}
const acceptObligationTx = obligationBeforeConsent.accepted
  ? null
  : await write("accept_obligation", "accept_obligation", [obligationId, obligationBeforeConsent.terms_digest], counterpartyClient);
const openTx = resumeCheckpointId === undefined ? await write("open_due_checkpoint", "open_due_checkpoint", [obligationId]) : null;
const checkpointId = openTx ? decodeReturnedId(openTx.transaction, openTx.receipt) : resumeCheckpointId;
const sealedCheckpoint = await read("get_checkpoint", [checkpointId]);
const earlyAssessmentControl = Math.floor(Date.now() / 1000) < Number(sealedCheckpoint.window_end)
  ? await expectRollback("assess_before_window_end", "assess_checkpoint", [checkpointId])
  : null;
if (earlyAssessmentControl) {
  const afterEarlyAssessment = await read("get_checkpoint", [checkpointId]);
  if (JSON.stringify(afterEarlyAssessment) !== JSON.stringify(sealedCheckpoint)) throw new Error("Early assessment rollback mutated checkpoint state");
}
while (Math.floor(Date.now() / 1000) < Number(sealedCheckpoint.window_end)) {
  const remaining = Number(sealedCheckpoint.window_end) - Math.floor(Date.now() / 1000);
  process.stdout.write(`observation window open: ${remaining}s remaining\n`);
  await new Promise((resolve) => setTimeout(resolve, Math.min(remaining, 15) * 1000));
}
const assessTx = await write("assess_checkpoint", "assess_checkpoint", [checkpointId]);
const checkpoint = await read("get_checkpoint", [checkpointId]);
const obligation = await read("get_obligation", [obligationId]);
const totals = await read("get_totals");
if (checkpoint.semantic_state !== expectedState || obligation.standing !== expectedState) throw new Error(`Expected ${expectedState}, got checkpoint=${checkpoint.semantic_state} standing=${obligation.standing}`);
const expectedAgreementDelta = agreementTx ? 1 : 0;
const expectedObligationDelta = obligationTx ? 1 : 0;
const expectedCheckpointDelta = openTx ? 1 : 0;
if (Number(totals.agreements) !== Number(initial.agreements) + expectedAgreementDelta || Number(totals.obligations) !== Number(initial.obligations) + expectedObligationDelta || Number(totals.checkpoints) !== Number(initial.checkpoints) + expectedCheckpointDelta) throw new Error("Final totals do not match lifecycle writes");
process.stdout.write(`LIFECYCLE_COMPLETE ${JSON.stringify({ contract, agreementId, obligationId, checkpointId, expectedState, controls: [mismatchedConsentControl, earlyAssessmentControl].filter(Boolean), transactions: [agreementTx?.hash, acceptTx?.hash, obligationTx?.hash, acceptObligationTx?.hash, openTx?.hash, assessTx.hash].filter(Boolean), checkpoint, obligation, totals }, null, 2)}\n`);

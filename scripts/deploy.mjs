import { readFile } from "node:fs/promises";
import { createAccount, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const rawKey = process.env.DEPLOYER_PRIVATE_KEY?.trim();
const account = rawKey
  ? createAccount(rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`)
  : createAccount();
process.stdout.write(`Deployer Address: ${account.address}\n`);

const client = createClient({ chain: studionet, account });
const code = await readFile(new URL("../contracts/PactPilot.py", import.meta.url), "utf8");
const hash = await client.deployContract({ code, args: [] });
process.stdout.write(`Transaction submitted: ${hash}\n`);
process.stdout.write(`Waiting for FINALIZED status on StudioNet...\n`);

const receipt = await client.waitForTransactionReceipt({
  hash,
  status: TransactionStatus.FINALIZED,
  interval: 2500,
  retries: 300,
});

const contractAddress =
  receipt.data?.contract_address ||
  receipt.contractAddress ||
  receipt.contract_address ||
  receipt.data?.contractAddress;

process.stdout.write(`\n=== Deployment Successful ===\n`);
process.stdout.write(`Transaction Hash: ${hash}\n`);
process.stdout.write(`Contract Address: ${contractAddress}\n`);
process.stdout.write(`Explorer URL: https://explorer-studio.genlayer.com/address/${contractAddress}\n`);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);


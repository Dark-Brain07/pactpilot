import { transactionResultNumberToName } from 'genlayer-js/types';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};

/** Only the finalized consensus outcome authorizes a frontend success claim. */
export function finalizedFailure(transaction: Record<string, unknown>): string {
  if (transaction.statusName !== 'FINALIZED') return 'Transaction is not finalized. Check its hash before retrying.';
  const resultNames: Readonly<Record<string, string>> = transactionResultNumberToName;
  const consensus = (transaction.resultName as string | undefined) ?? (transaction.result_name as string | undefined) ?? resultNames[String(transaction.result)];
  if (consensus !== 'AGREE' && consensus !== 'MAJORITY_AGREE') return 'Finalized transaction has no successful consensus.';
  const receipts = object(transaction.consensus_data).leader_receipt;
  const leader = object(Array.isArray(receipts) ? receipts[0] : undefined);
  const result = object(leader.result);
  if (result.status === 'rollback') return `Contract rejected this action: ${String(result.payload ?? 'ROLLBACK')}`;
  if (leader.execution_result !== 'SUCCESS' || result.status !== 'return') return 'Finalized execution success could not be verified.';
  return '';
}

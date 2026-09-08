import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus, transactionResultNumberToName } from 'genlayer-js/types';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeReturnedId } from '../lib/receipt.ts';

const address = '0x03B1d1c9761A8EabfB365dB42AE2F513575c5D89';
const reportPath = 'docs/v2-suite-results.json';
if (existsSync(reportPath)) throw new Error('Report already exists: inspect it before any new run; no automatic duplicate writes.');
async function readTestWalletInputs() {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  const values = []; let line = '';
  for await (const chunk of process.stdin) {
    for (const char of String(chunk)) {
      if (char === '\n' || char === '\r') {
        if (line) { values.push(line.trim()); line = ''; }
        if (values.length === 2) { if (process.stdin.isTTY) process.stdin.setRawMode(false); return values; }
      } else line += char;
    }
  }
  throw new Error('Two test keys required through stdin.');
}
const keys = await readTestWalletInputs();
const accounts = keys.map(k => createAccount(k.startsWith('0x') ? k : `0x${k}`));
keys.fill('');
const [owner, party] = accounts.map(account => createClient({chain: studionet, account}));
const report = {address, startedAt: new Date().toISOString(), actors: accounts.map(a=>a.address), resources: [], transactions: [], scenarios: [], complete: false};
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2)+'\n');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function read(functionName,args=[]) {
  let value = await owner.readContract({address,functionName,args});
  if(typeof value==='string') value=JSON.parse(value);
  if(value?.result!==undefined) value=typeof value.result==='string'?JSON.parse(value.result):value.result;
  return value;
}
async function snapshot(agreementId,obligationId,checkpointId) {
  return {totals:await read('get_totals'),
    agreement:agreementId===undefined?null:await read('get_agreement',[agreementId]),
    obligation:obligationId===undefined?null:await read('get_obligation',[obligationId]),
    checkpoint:checkpointId===undefined?null:await read('get_checkpoint',[checkpointId])};
}
async function tx(label,client,functionName,args,expectedError,ids=[]) {
  const before=expectedError?await snapshot(...ids):null;
  const txHash=await client.writeContract({address,functionName,args,value:0n});
  const record={label,hash:txHash,method:functionName,args,expectedError:expectedError??null};
  report.transactions.push(record);save();console.log(`${label}: submitted ${txHash}`);
  const receipt=await client.waitForTransactionReceipt({hash:txHash,status:TransactionStatus.FINALIZED,interval:2000,retries:600});
  const transaction=await client.getTransaction({hash:txHash});
  const leader=transaction.consensus_data?.leader_receipt?.[0];
  const result=leader?.result;
  record.status=transaction.statusName??receipt.statusName;
  record.consensus=transaction.resultName??transactionResultNumberToName[String(transaction.result)];
  record.execution=leader?.execution_result;
  record.result=result;
  save();
  if(record.status!=='FINALIZED') throw new Error(`${label}: not finalized`);
  if(expectedError){
    const reason=typeof result?.payload==='string'?result.payload:result?.payload?.readable;
    record.before=before;record.after=await snapshot(...ids);
    record.passed=result?.status==='rollback'&&reason===expectedError&&JSON.stringify(before)===JSON.stringify(record.after);
  }else record.passed=record.execution==='SUCCESS'&&['AGREE','MAJORITY_AGREE'].includes(record.consensus);
  save();if(!record.passed) throw new Error(`${label}: failed; see report`);
  console.log(`${label}: FINALIZED ${expectedError??'SUCCESS'}`);
  return {record,transaction,receipt};
}
async function create(label,client,method,args){const result=await tx(label,client,method,args);return decodeReturnedId(result.transaction,result.receipt);}

try {
  report.version=await read('get_contract_version');
  if(report.version.version!==2) throw new Error('Wrong deployed version');
  const deployed=await owner.getContractCode(address);
  report.sourceSha256=hash(deployed);report.sourceParity=hash(readFileSync('contracts/PactPilot.py'))===report.sourceSha256;
  if(!report.sourceParity) throw new Error('Deployed source mismatch');
  const base='https://raw.githubusercontent.com/Dark-Brain07/PactPilot/main/samples/';
  for(const [state,file] of [['SATISFIED','v2-uptime-satisfied.json'],['BREACHED','v2-uptime-breached.json']]){
    const response=await fetch(base+file);const bytes=Buffer.from(await response.arrayBuffer());
    const data=JSON.parse(bytes.toString());const interval=data.observation_window.split('/').map(Date.parse);
    if(!response.ok||hash(bytes)!==hash(readFileSync('samples/'+file))) throw new Error('Fixture integrity failure');
    if(Date.now()<interval[0]||Date.now()+3600000>interval[1]) throw new Error('Fixture interval insufficient for run');
    report.resources.push({state,url:base+file,sha256:hash(bytes),bytes:bytes.length,interval});
  }
  report.initial=await read('get_totals');save();
  const agreementId=await create('register_suite',owner,'register_agreement',[accounts[1].address,'V2 synthetic assurance test','v1','7213d0b657b15aca1addeb81ee75434cef1174134fa8df5dd7ad7870d79187cc']);
  report.agreementId=agreementId;save();
  await tx('unauthorized_agreement_accept',owner,'accept_agreement',[agreementId],'COUNTERPARTY_ONLY',[agreementId]);
  await tx('accept_suite_agreement',party,'accept_agreement',[agreementId]);
  const scenarios=[...report.resources,{state:'UNRESOLVED',url:base+'v2-deliberately-missing-source.json'}];
  for(const resource of scenarios){
    const obligationId=await create('add_'+resource.state,owner,'add_obligation',[agreementId,'suite-'+resource.state.toLowerCase(),'UPTIME','Commercially reasonable uptime','Maintain commercially reasonable availability for the PactPilot Demo API during every sealed observation window.','https://raw.githubusercontent.com',resource.url,'PactPilot Demo API',86400,300]);
    const scenario={...resource,obligationId};report.scenarios.push(scenario);save();
    const obligation=await read('get_obligation',[obligationId]);
    if(resource.state==='SATISFIED'){
      await tx('unauthorized_obligation_accept',owner,'accept_obligation',[obligationId,obligation.terms_digest],'COUNTERPARTY_ONLY',[agreementId,obligationId]);
      await tx('unaccepted_checkpoint',owner,'open_due_checkpoint',[obligationId],'OBLIGATION_NOT_ACCEPTED',[agreementId,obligationId]);
    }
    await tx('accept_'+resource.state,party,'accept_obligation',[obligationId,obligation.terms_digest]);
    scenario.checkpointId=await create('open_'+resource.state,owner,'open_due_checkpoint',[obligationId]);
    scenario.sealed=await read('get_checkpoint',[scenario.checkpointId]);save();
  }
  const first=report.scenarios[0];const terms=await read('get_obligation',[first.obligationId]);
  await tx('repeat_accept',party,'accept_obligation',[first.obligationId,terms.terms_digest],'OBLIGATION_NOT_ACCEPTABLE',[agreementId,first.obligationId,first.checkpointId]);
  await tx('checkpoint_not_due',owner,'open_due_checkpoint',[first.obligationId],'CHECKPOINT_NOT_DUE',[agreementId,first.obligationId,first.checkpointId]);
  await tx('unauthorized_close',party,'close_obligation',[first.obligationId],'OWNER_ONLY',[agreementId,first.obligationId,first.checkpointId]);
  for(const scenario of report.scenarios){
    while(Date.now()/1000<scenario.sealed.window_end){console.log('Waiting for sealed window',scenario.state);await new Promise(r=>setTimeout(r,15000));}
    await tx('assess_'+scenario.state,owner,'assess_checkpoint',[scenario.checkpointId]);
    scenario.checkpoint=await read('get_checkpoint',[scenario.checkpointId]);scenario.obligation=await read('get_obligation',[scenario.obligationId]);
    scenario.passed=scenario.checkpoint.semantic_state===scenario.state&&scenario.obligation.standing===scenario.state&&scenario.checkpoint.observed_at>=scenario.checkpoint.window_end;
    if(scenario.sha256) scenario.passed&&=scenario.checkpoint.snapshot_sha256===scenario.sha256&&scenario.checkpoint.status==='ASSESSED';
    else scenario.passed&&=scenario.checkpoint.status==='UNRESOLVED';
    save();if(!scenario.passed) throw new Error('Unexpected semantic result '+scenario.state);
  }
  await tx('terminal_replay',owner,'assess_checkpoint',[first.checkpointId],'CHECKPOINT_NOT_OPEN',[agreementId,first.obligationId,first.checkpointId]);
  const missing=report.scenarios[2];
  await tx('retry_unavailable',owner,'assess_checkpoint',[missing.checkpointId]);
  missing.retry=await read('get_checkpoint',[missing.checkpointId]);
  if(missing.retry.status!=='UNRESOLVED'||missing.retry.semantic_state!=='UNRESOLVED') throw new Error('Retry failed closed invariant');
  await tx('close_unavailable',owner,'close_obligation',[missing.obligationId]);
  await tx('assess_closed_obligation',owner,'assess_checkpoint',[missing.checkpointId],'STALE_CHECKPOINT',[agreementId,missing.obligationId,missing.checkpointId]);
  report.final=await read('get_totals');report.complete=true;report.finishedAt=new Date().toISOString();save();console.log('SUITE_COMPLETE',JSON.stringify(report.final));
}catch(error){report.error=error.message;save();console.error(error.message);process.exitCode=1;}

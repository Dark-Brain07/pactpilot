import { createClient } from "genlayer-js";
import { localnet, studionet, testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import { finalizedFailure } from "./finality";

type NetworkName = "localnet" | "studionet" | "testnetBradbury";
declare global { interface Window { ethereum?: { request:(args:{method:string;params?:unknown[]})=>Promise<unknown> } } }
const network = (process.env.NEXT_PUBLIC_NETWORK as NetworkName) || "studionet";
const chains = { localnet, studionet, testnetBradbury };
const readClient = createClient({ chain: chains[network] ?? studionet });
type RuntimeClient = {
  connect?:(name:NetworkName)=>Promise<unknown>;
  readContract:(args:{address:string;functionName:string;args:unknown[]})=>Promise<unknown>;
  writeContract:(args:{address:string;functionName:string;args:unknown[];value:bigint})=>Promise<string|{txId:string}>;
  waitForTransactionReceipt:(args:{hash:`0x${string}`;status:string;interval?:number;retries?:number})=>Promise<Record<string,unknown>>;
  getTransaction:(args:{hash:`0x${string}`})=>Promise<Record<string,unknown>>;
};
export type Result={success:boolean;data?:unknown;hash?:string;error?:string;receipt?:Record<string,unknown>;transaction?:Record<string,unknown>};
const address=()=>process.env.NEXT_PUBLIC_CONTRACT_ADDRESS||"";
export const contractAddress=address;
export const explorerUrl=()=>`${process.env.NEXT_PUBLIC_EXPLORER_BASE||"https://explorer-studio.genlayer.com/address/"}${address()}`;
export async function connectWallet():Promise<Result>{
  if(!window.ethereum)return{success:false,error:"Install or unlock an EVM wallet."};
  try{const accounts=await window.ethereum.request({method:"eth_requestAccounts"}) as string[];return accounts[0]?{success:true,data:accounts[0]}:{success:false,error:"No account selected."};}
  catch(error){return{success:false,error:error instanceof Error?error.message:"Wallet connection failed."};}
}
export async function readContract(functionName:string,args:unknown[]=[]):Promise<Result>{
  if(!address()||/^0x0{40}$/i.test(address()))return{success:false,error:"Deploy and configure the contract first."};
  try{return{success:true,data:await(readClient as unknown as RuntimeClient).readContract({address:address(),functionName,args})};}
  catch(error){return{success:false,error:error instanceof Error?error.message:"Contract read failed."};}
}
export async function writeContract(functionName:string,args:unknown[]=[]):Promise<Result>{
  if(!window.ethereum)return{success:false,error:"Connect a wallet before writing."};
  if(!address()||/^0x0{40}$/i.test(address()))return{success:false,error:"Deploy and configure the contract first."};
  let hash="";
  try{
    const accounts=await window.ethereum.request({method:"eth_requestAccounts"}) as string[];
    const client=createClient({chain:chains[network]??studionet,provider:window.ethereum,account:accounts[0] as `0x${string}`}) as unknown as RuntimeClient;
    if(client.connect)await client.connect(network);
    const raw=await client.writeContract({address:address(),functionName,args,value:BigInt(0)});hash=typeof raw==="string"?raw:raw.txId;
    const receipt=await client.waitForTransactionReceipt({hash:hash as `0x${string}`,status:TransactionStatus.FINALIZED,interval:2000,retries:600});
    const transaction=await client.getTransaction({hash:hash as `0x${string}`});
    const failure=finalizedFailure(transaction);if(failure)return{success:false,hash,error:failure,receipt,transaction};
    return{success:true,hash,data:receipt,receipt,transaction};
  }catch(error){return{success:false,hash,error:error instanceof Error?error.message:"Contract write failed."};}
}
export function unwrap<T>(value:unknown):T|null{try{if(typeof value==="string")return JSON.parse(value) as T;if(value&&typeof value==="object"&&"result" in value)return unwrap<T>((value as {result:unknown}).result);return value as T;}catch{return null;}}

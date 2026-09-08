import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Clock3, FileSearch, Radar, ShieldCheck, Workflow } from "lucide-react";

const states=[
  ["SATISFIED","All mandatory predicates observed true.","good"],
  ["AT RISK","A bounded warning requires attention.","warn"],
  ["BREACHED","Positive contradictory facts were verified.","bad"],
  ["UNRESOLVED","Evidence or consensus was insufficient.","quiet"],
];

export default function Home(){return <main>
  <header><Link className="brand" href="/"><Image className="brandLogo" src="/pactpilot-logo.jpg" alt="" width={36} height={36} priority/>PactPilot</Link><nav><a href="#primitive">Primitive</a><a href="#safety">Safety</a><Link href="/monitor">Monitor</Link></nav><Link className="outline" href="/monitor">Open console</Link></header>
  <section className="hero"><div className="signal"/><div className="kicker"><span/> GENLAYER COMMERCIAL ASSURANCE</div><h1>Contracts should not<br/><em>go dark after signing.</em></h1><p>Turn bounded commercial clauses into living obligations, observed at sealed checkpoints and grounded in approved public evidence.</p><div className="actions"><Link className="primary" href="/monitor">Launch monitor <ArrowRight/></Link><a className="secondary" href="#primitive">See the mechanism</a></div><div className="statusRail">{states.map(([state,copy,tone])=><article key={state} className={tone}><small>{state}</small><b>{copy}</b></article>)}</div></section>
  <section id="primitive" className="section"><div className="sectionHead"><small>THE PRIMITIVE</small><h2>A temporal assurance graph,<br/>not an AI dispute court.</h2></div><div className="grid3"><article><FileSearch/><b>Bounded obligation</b><p>Human-approved clause digest, agreement version, counterparty and exact semantic requirement.</p></article><article><Clock3/><b>Sealed checkpoint</b><p>Each observation binds a due sequence, time window and approved authority origin.</p></article><article><Workflow/><b>Append-only standing</b><p>Validators judge evidence. Deterministic code controls provenance, freshness and state updates.</p></article></div></section>
  <section id="safety" className="section split"><div><small>FAIL CLOSED BY DESIGN</small><h2>Missing evidence is not a breach.</h2><p>Unavailable sources, incomplete coverage, malformed model output and disagreement become <code>UNRESOLVED</code>. They cannot fabricate compliance or violation.</p></div><div className="checks"><span><ShieldCheck/> Exact authority origin</span><span><CheckCircle2/> Counterparty + version binding</span><span><Clock3/> Stale checkpoint protection</span><span><Radar/> Independent validator refetch</span></div></section>
  <footer><div className="brand"><Image className="brandLogo" src="/pactpilot-logo.jpg" alt="" width={36} height={36}/>PactPilot</div><p>Public evidence monitoring. Not legal advice or an automated damages engine.</p><Link href="/monitor">Monitor obligations →</Link></footer>
  </main>}

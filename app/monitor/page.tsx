"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Activity, ArrowLeft, Coins, ExternalLink, FileKey2, LoaderCircle, Plus, RefreshCw, ScanSearch, ShieldAlert, ShieldCheck, Wallet, Workflow } from "lucide-react";
import { connectWallet, contractAddress, explorerUrl, readContract, unwrap, writeContract } from "@/lib/genlayer";
import { decodeReturnedId } from "@/lib/receipt";

type Totals = {
  agreements: number;
  obligations: number;
  checkpoints: number;
  total_deposited_wei?: number;
  reserved_bonds_wei?: number;
};

type ContractInfo = {
  name: string;
  version: number;
  consent_schema: string;
  financial_engine?: string;
};

type ObligationReadback = {
  loadedId: string;
  agreement_id: string;
  obligation_key: string;
  kind: string;
  title: string;
  requirement: string;
  authority_origin: string;
  evidence_url: string;
  object_marker: string;
  cadence_seconds: number;
  window_seconds: number;
  terms_digest: string;
  accepted: boolean;
  accepted_at: number;
  bond_amount_wei?: number;
  funded_bond_wei?: number;
  penalty_per_breach_wei?: number;
  retainer_payout_wei?: number;
};

type CheckpointReadback = {
  loadedId: string;
  window_start: number;
  window_end: number;
  status: string;
  semantic_state: string;
  windowComplete: boolean;
  settlement_status?: string;
  remedy_amount_wei?: number;
};

type Notice = { tone: "ok" | "error" | "pending"; text: string };

type SolvencyReport = {
  total_deposited_wei: number;
  reserved_bonds_wei: number;
  is_solvent: boolean;
};

export default function Monitor() {
  const [wallet, setWallet] = useState("");
  const [contractVersion, setContractVersion] = useState<number>(3);
  const [compatible, setCompatible] = useState(false);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [solvency, setSolvency] = useState<SolvencyReport | null>(null);
  const [userClaimable, setUserClaimable] = useState<number>(0);
  const [loadedObligation, setObligationReadback] = useState<ObligationReadback | null>(null);
  const [loadedCheckpoint, setCheckpointReadback] = useState<CheckpointReadback | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [agreement, setAgreement] = useState({
    counterparty: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    name: "Cloud Services Agreement",
    version: "v1",
    digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  });

  const [obligation, setObligation] = useState({
    agreementId: "",
    key: "uptime-core",
    kind: "UPTIME",
    title: "Commercially reasonable uptime",
    requirement: "Maintain commercially reasonable availability for the bound service during every sealed observation window.",
    origin: "https://example.com",
    url: "https://example.com/status",
    marker: "service status",
    cadence: "86400",
    window: "3600",
    bondAmount: "1000",
    penaltyAmount: "200",
    retainerAmount: "50",
  });

  const [checkpoint, setCheckpoint] = useState({ obligationId: "", checkpointId: "" });
  const [bondFunding, setBondFunding] = useState({ obligationId: "", amountWei: "1000" });

  const obligationReadback = loadedObligation?.loadedId === checkpoint.obligationId ? loadedObligation : null;
  const checkpointReadback = loadedCheckpoint?.loadedId === checkpoint.checkpointId ? loadedCheckpoint : null;
  const busy = notice?.tone === "pending";

  const connect = useCallback(async () => {
    const result = await connectWallet();
    if (result.success) {
      const addr = String(result.data);
      setWallet(addr);
      // Fetch user claimable balance
      const balRes = await readContract("get_claimable_balance", [addr]);
      if (balRes.success) setUserClaimable(Number(unwrap<number>(balRes.data) || 0));
    } else {
      setNotice({ tone: "error", text: result.error || "Wallet connection failed." });
    }
  }, []);

  const sync = useCallback(async (requestedObligationId = checkpoint.obligationId, requestedCheckpointId = checkpoint.checkpointId) => {
    setCompatible(false);
    setObligationReadback(null);
    setCheckpointReadback(null);
    setNotice({ tone: "pending", text: "Verifying contract schema and authoritative state…" });

    const versionResult = await readContract("get_contract_version");
    if (!versionResult.success) {
      setNotice({ tone: "error", text: `Contract read failed: ${versionResult.error || "Unable to reach StudioNet RPC."}` });
      return false;
    }
    const contractInfo = unwrap<ContractInfo>(versionResult.data);
    if (!contractInfo || contractInfo.name !== "PactPilot" || (contractInfo.version !== 2 && contractInfo.version !== 3) || contractInfo.consent_schema !== "exact-obligation-digest") {
      setNotice({ tone: "error", text: `Configured address returned unexpected schema (${contractInfo?.name ?? "unknown"} v${contractInfo?.version ?? "?"}). Expected PactPilot V2 or V3.` });
      return false;
    }
    setContractVersion(contractInfo.version);

    const result = await readContract("get_totals");
    if (!result.success) {
      setNotice({ tone: "error", text: result.error || "Read failed." });
      return false;
    }
    const parsed = unwrap<Totals>(result.data);
    if (!parsed) {
      setNotice({ tone: "error", text: "Contract returned an unreadable totals payload." });
      return false;
    }
    setCompatible(true);
    setTotals(parsed);

    // Fetch solvency report if V3
    const solvResult = await readContract("get_solvency_report");
    if (solvResult.success) {
      const solvData = unwrap<SolvencyReport>(solvResult.data);
      if (solvData) setSolvency(solvData);
    }

    if (wallet) {
      const balRes = await readContract("get_claimable_balance", [wallet]);
      if (balRes.success) setUserClaimable(Number(unwrap<number>(balRes.data) || 0));
    }

    if (requestedObligationId) {
      const item = await readContract("get_obligation", [requestedObligationId]);
      if (!item.success) {
        setNotice({ tone: "error", text: item.error || "Obligation readback failed." });
        return false;
      }
      const parsedObligation = unwrap<ObligationReadback>(item.data);
      if (!parsedObligation?.terms_digest) {
        setNotice({ tone: "error", text: "Unreadable obligation terms." });
        return false;
      }
      setObligationReadback({ ...parsedObligation, loadedId: requestedObligationId });
    }

    if (requestedCheckpointId) {
      const item = await readContract("get_checkpoint", [requestedCheckpointId]);
      if (!item.success) {
        setNotice({ tone: "error", text: item.error || "Checkpoint readback failed." });
        return false;
      }
      const parsedCheckpoint = unwrap<Omit<CheckpointReadback, "windowComplete">>(item.data);
      if (!parsedCheckpoint) {
        setNotice({ tone: "error", text: "Contract returned an unreadable checkpoint payload." });
        return false;
      }
      setCheckpointReadback({
        ...parsedCheckpoint,
        loadedId: requestedCheckpointId,
        windowComplete: Math.floor(Date.now() / 1000) >= parsedCheckpoint.window_end,
      });
    }

    setNotice({ tone: "ok", text: `PactPilot V${contractInfo.version} schema verified; authoritative state synchronized.` });
    return true;
  }, [checkpoint.obligationId, checkpoint.checkpointId, wallet]);

  async function submit(label: string, method: string, args: unknown[], onId?: (id: string) => void) {
    if (!wallet) {
      setNotice({ tone: "error", text: "Please connect your wallet first via 'Connect wallet' in the top right." });
      return;
    }
    if (!compatible) {
      setNotice({ tone: "error", text: "Click 'Sync contract' to verify the contract before writing." });
      return;
    }

    if (method === "register_agreement") {
      const party = String(args[0] || "").trim().toLowerCase();
      const name = String(args[1] || "").trim();
      const ver = String(args[2] || "").trim();
      const sha = String(args[3] || "").trim().toLowerCase();
      if (!party || !/^0x[0-9a-f]{40}$/i.test(party)) {
        setNotice({ tone: "error", text: "Counterparty must be a valid 42-character address (0x…)." });
        return;
      }
      if (wallet && party === wallet.toLowerCase()) {
        setNotice({ tone: "error", text: "Counterparty cannot be your own connected wallet. Use a secondary or partner address." });
        return;
      }
      if (name.length < 3 || name.length > 96) {
        setNotice({ tone: "error", text: "Agreement name must be between 3 and 96 characters." });
        return;
      }
      if (!ver) {
        setNotice({ tone: "error", text: "Agreement version is required (e.g. v1)." });
        return;
      }
      if (!sha || sha.length !== 64 || !/^[0-9a-f]{64}$/.test(sha)) {
        setNotice({ tone: "error", text: "Clause bundle SHA-256 must be exactly 64 lowercase hexadecimal characters." });
        return;
      }
    }

    if (method === "accept_agreement") {
      const agreeId = String(args[0] || "");
      if (!agreeId) {
        setNotice({ tone: "error", text: "Agreement ID is required to accept." });
        return;
      }
      const verified = await readContract("get_agreement", [agreeId]);
      const data = verified.success ? unwrap<{ accepted: boolean; owner: string; counterparty: string }>(verified.data) : null;
      if (!data) {
        setNotice({ tone: "error", text: `Agreement #${agreeId} was not found.` });
        return;
      }
      if (data.accepted) {
        setNotice({ tone: "error", text: `Agreement #${agreeId} is already accepted.` });
        return;
      }
      if (wallet && data.counterparty && data.counterparty.toLowerCase() !== wallet.toLowerCase()) {
        setNotice({ tone: "error", text: `Only the counterparty wallet (${data.counterparty.slice(0, 6)}…${data.counterparty.slice(-4)}) can accept this agreement. Switch to the counterparty wallet.` });
        return;
      }
    }

    if (method === "add_obligation") {
      const agreeId = String(args[0] || "");
      if (!agreeId) {
        setNotice({ tone: "error", text: "Agreement ID is required before adding obligations." });
        return;
      }
      const verified = await readContract("get_agreement", [agreeId]);
      const data = verified.success ? unwrap<{ accepted: boolean; owner: string; counterparty: string }>(verified.data) : null;
      if (!data) {
        setNotice({ tone: "error", text: `Agreement #${agreeId} was not found on-chain.` });
        return;
      }
      if (!data.accepted) {
        setNotice({ tone: "error", text: `Agreement #${agreeId} has not been accepted yet! Switch wallet to counterparty and accept first.` });
        return;
      }
      if (wallet && data.owner && data.owner.toLowerCase() !== wallet.toLowerCase()) {
        setNotice({ tone: "error", text: `Only the agreement owner (${data.owner.slice(0, 6)}…${data.owner.slice(-4)}) can add obligations.` });
        return;
      }
    }

    setNotice({ tone: "pending", text: `${label}: waiting for finality and consensus…` });
    const result = await writeContract(method, args);
    if (!result.success) {
      setNotice({ tone: "error", text: result.error || `${label} failed.` });
      return;
    }

    try {
      let returnedId = "";
      if (onId) {
        returnedId = decodeReturnedId(result.transaction, result.receipt, result.data);
        onId(returnedId);
      }
      if (method === "register_agreement" || method === "accept_agreement") {
        const verified = await readContract("get_agreement", [method === "register_agreement" ? returnedId : args[0]]);
        const data = verified.success ? unwrap<{ accepted: boolean }>(verified.data) : null;
        if (!data || (method === "accept_agreement" && !data.accepted)) {
          throw new Error("Transaction finalized, but agreement readback could not be verified.");
        }
      }
      const reconciled = await sync(
        method === "add_obligation" ? returnedId : checkpoint.obligationId,
        method === "open_due_checkpoint" ? returnedId : checkpoint.checkpointId
      );
      if (!reconciled) return;
      setNotice({ tone: "ok", text: `${label} finalized and reconciled with contract readback.${result.hash ? ` Tx ${result.hash.slice(0, 10)}…` : ""}` });
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Finalized return could not be verified." });
    }
  }

  return (
    <main className="console">
      <header>
        <Link className="brand" href="/">
          <Image className="brandLogo" src="/pactpilot-logo.jpg" alt="" width={36} height={36} priority />
          PactPilot
        </Link>
        <Link className="back" href="/">
          <ArrowLeft /> Product
        </Link>
        <div className="consoleActions">
          <a href={explorerUrl()} target="_blank" aria-label="Open explorer">
            <ExternalLink />
          </a>
          <button onClick={connect}>
            <Wallet />
            {wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "Connect wallet"}
          </button>
        </div>
      </header>

      <section className="consoleHero">
        <div>
          <small>OBLIGATION & SLA ESCROW CONTROL PLANE</small>
          <h1>Observe what the agreement requires. Settle trustlessly.</h1>
          <p>Autonomous commercial assurance backed by 1:1 solvent GenLayer performance bonds and AI consensus.</p>
        </div>
        <button className="sync" onClick={() => sync()} disabled={busy}>
          <RefreshCw /> Sync contract
        </button>
      </section>

      <section className="ledger">
        <div>
          <small>ACTIVE CONTRACT · {compatible ? `V${contractVersion} VERIFIED` : "UNVERIFIED"}</small>
          <b>{contractAddress() || "NOT CONFIGURED"}</b>
        </div>
        <div>
          <small>AGREEMENTS</small>
          <b>{totals?.agreements ?? "—"}</b>
        </div>
        <div>
          <small>OBLIGATIONS</small>
          <b>{totals?.obligations ?? "—"}</b>
        </div>
        <div>
          <small>CHECKPOINTS</small>
          <b>{totals?.checkpoints ?? "—"}</b>
        </div>
        <div>
          <small>TOTAL ESCROW BOND</small>
          <b style={{ color: "var(--doodle-purple)" }}>{solvency ? `${solvency.total_deposited_wei} wei` : totals?.total_deposited_wei ? `${totals.total_deposited_wei} wei` : "—"}</b>
        </div>
        <div>
          <small>SOLVENCY STATUS</small>
          <b style={{ color: solvency?.is_solvent !== false ? "#10b981" : "#ef4444" }}>{solvency?.is_solvent !== false ? "100% SOLVENT" : "IMBALANCE"}</b>
        </div>
      </section>

      {notice && (
        <div className={`notice ${notice.tone}`}>
          {notice.tone === "pending" ? <LoaderCircle className="spin" /> : notice.tone === "error" ? <ShieldAlert /> : <Activity />}
          <span>{notice.text}</span>
        </div>
      )}

      <section className="howWorks">
        <div className="howIntro">
          <small>HOW IT WORKS · V3 LIFECYCLE</small>
          <h2>Configure, consent, fund, observe, settle.</h2>
          <p>PactPilot binds natural language obligations to on-chain collateral. GenLayer machine consensus adjudicates breaches and automatically liquidates damages.</p>
        </div>
        <div className="howSteps">
          <article>
            <span>01</span>
            <FileKey2 />
            <div>
              <b>Register agreement</b>
              <p>Owner and counterparty bind themselves to the immutable agreement version and clause digest.</p>
            </div>
          </article>
          <article>
            <span>02</span>
            <Workflow />
            <div>
              <b>Accept SLA terms & bond</b>
              <p>Owner sets requirements, schedule, and SLA penalty bond. Counterparty accepts exact terms digest.</p>
            </div>
          </article>
          <article>
            <span>03</span>
            <ScanSearch />
            <div>
              <b>Observe & judge</b>
              <p>Validators fetch evidence after the observation window and reach consensus on compliance standing.</p>
            </div>
          </article>
          <article>
            <span>04</span>
            <Coins />
            <div>
              <b>Autonomous settlement</b>
              <p>BREACHED slashes performance bond and credits damages to counterparty; pull-payment withdraw anytime.</p>
            </div>
          </article>
        </div>
        <div className="howHint">
          <b>Result guide</b>
          <span><i className="satisfied" /> SATISFIED (Retainer Released)</span>
          <span><i className="risk" /> AT RISK (Grace Notice)</span>
          <span><i className="breach" /> BREACHED (Remedy Slashed)</span>
          <span><i className="unresolved" /> UNRESOLVED (Fail-Closed Safe)</span>
        </div>
      </section>

      <section className="workGrid">
        {/* CARD 01: AGREEMENT REGISTRY */}
        <article className="workCard">
          <div className="cardTitle">
            <span>01</span>
            <div>
              <small>AGREEMENT REGISTRY</small>
              <h2>Bind and accept the agreement</h2>
            </div>
          </div>
          <label>
            Counterparty wallet{" "}
            <small style={{ color: "var(--doodle-purple)", cursor: "pointer" }} onClick={() => setAgreement({ ...agreement, counterparty: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" })}>
              [use demo address]
            </small>
            <input value={agreement.counterparty} onChange={(e) => setAgreement({ ...agreement, counterparty: e.target.value })} placeholder="0x… (must be different from your wallet)" />
          </label>
          <div className="two">
            <label>
              Agreement name
              <input value={agreement.name} onChange={(e) => setAgreement({ ...agreement, name: e.target.value })} />
            </label>
            <label>
              Version
              <input value={agreement.version} onChange={(e) => setAgreement({ ...agreement, version: e.target.value })} />
            </label>
          </div>
          <label>
            Clause bundle SHA-256{" "}
            <small style={{ color: "var(--doodle-purple)", cursor: "pointer" }} onClick={() => setAgreement({ ...agreement, digest: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" })}>
              [reset standard hash]
            </small>
            <input value={agreement.digest} onChange={(e) => setAgreement({ ...agreement, digest: e.target.value })} placeholder="64 lowercase hex characters" />
          </label>
          <button className="primary wide" disabled={busy} onClick={() => submit("Register agreement", "register_agreement", [agreement.counterparty, agreement.name, agreement.version, agreement.digest], (id) => setObligation({ ...obligation, agreementId: id }))}>
            <Plus /> Register agreement
          </button>
          <div className="consentBox">
            <div>
              <b>Counterparty consent</b>
              <p>Switch to the named counterparty wallet, verify the agreement ID and accept before adding obligations.</p>
            </div>
            <label>
              Agreement ID
              <input value={obligation.agreementId} onChange={(e) => setObligation({ ...obligation, agreementId: e.target.value })} />
            </label>
            <button className="secondary" disabled={busy || !obligation.agreementId} onClick={() => submit("Accept agreement", "accept_agreement", [obligation.agreementId])}>
              Accept agreement
            </button>
          </div>
        </article>

        {/* CARD 02: BOUNDED OBLIGATION & SLA TERMS */}
        <article className="workCard">
          <div className="cardTitle">
            <span>02</span>
            <div>
              <small>BOUNDED OBLIGATION & SLA TERMS</small>
              <h2>Approve source, schedule & bond</h2>
            </div>
          </div>
          <div className="two">
            <label>
              Agreement ID
              <input value={obligation.agreementId} onChange={(e) => setObligation({ ...obligation, agreementId: e.target.value })} />
            </label>
            <label>
              Obligation key
              <input value={obligation.key} onChange={(e) => setObligation({ ...obligation, key: e.target.value })} />
            </label>
          </div>
          <div className="two">
            <label>
              Kind
              <select value={obligation.kind} onChange={(e) => setObligation({ ...obligation, kind: e.target.value })}>
                <option>UPTIME</option>
                <option>INCIDENT_NOTICE</option>
                <option>CERTIFICATION</option>
              </select>
            </label>
            <label>
              Title
              <input value={obligation.title} onChange={(e) => setObligation({ ...obligation, title: e.target.value })} />
            </label>
          </div>
          <label>
            Bounded requirement
            <textarea value={obligation.requirement} onChange={(e) => setObligation({ ...obligation, requirement: e.target.value })} />
          </label>
          <div className="two">
            <label>
              Authority origin
              <input value={obligation.origin} onChange={(e) => setObligation({ ...obligation, origin: e.target.value })} />
            </label>
            <label>
              Exact evidence URL
              <input value={obligation.url} onChange={(e) => setObligation({ ...obligation, url: e.target.value })} />
            </label>
          </div>
          <label>
            Required object marker
            <input value={obligation.marker} onChange={(e) => setObligation({ ...obligation, marker: e.target.value })} />
          </label>
          <div className="two">
            <label>
              Cadence seconds
              <input value={obligation.cadence} onChange={(e) => setObligation({ ...obligation, cadence: e.target.value })} />
            </label>
            <label>
              Window seconds
              <input value={obligation.window} onChange={(e) => setObligation({ ...obligation, window: e.target.value })} />
            </label>
          </div>
          <div className="two" style={{ background: "rgba(139, 92, 246, 0.05)", padding: "8px", borderRadius: "8px", border: "1px dashed var(--line)" }}>
            <label>
              SLA Bond (wei)
              <input value={obligation.bondAmount} onChange={(e) => setObligation({ ...obligation, bondAmount: e.target.value })} placeholder="e.g. 1000" />
            </label>
            <label>
              Breach Penalty (wei)
              <input value={obligation.penaltyAmount} onChange={(e) => setObligation({ ...obligation, penaltyAmount: e.target.value })} placeholder="e.g. 200" />
            </label>
          </div>
          <button
            className="primary wide"
            disabled={busy}
            onClick={() =>
              submit(
                "Add obligation",
                "add_obligation",
                [
                  obligation.agreementId,
                  obligation.key,
                  obligation.kind,
                  obligation.title,
                  obligation.requirement,
                  obligation.origin,
                  obligation.url,
                  obligation.marker,
                  Number(obligation.cadence),
                  Number(obligation.window),
                  Number(obligation.bondAmount || 0),
                  Number(obligation.penaltyAmount || 0),
                  Number(obligation.retainerAmount || 0),
                ],
                (id) => {
                  setCheckpoint({ ...checkpoint, obligationId: id });
                  setBondFunding({ ...bondFunding, obligationId: id });
                }
              )
            }
          >
            <Plus /> Add obligation & SLA terms
          </button>
          <div className="consentBox">
            <div>
              <b>Exact obligation consent</b>
              <p>Switch to counterparty. Verify terms digest including performance bond before signing.</p>
              {obligationReadback?.terms_digest && (
                <code title={obligationReadback.terms_digest}>
                  {obligationReadback.terms_digest} · {obligationReadback.accepted ? "ACCEPTED" : "PENDING"}
                </code>
              )}
            </div>
            <label>
              Obligation ID
              <input
                value={checkpoint.obligationId}
                onChange={(e) => {
                  setCheckpoint({ ...checkpoint, obligationId: e.target.value });
                  setBondFunding({ ...bondFunding, obligationId: e.target.value });
                  setObligationReadback(null);
                }}
                placeholder="Returned ID"
              />
            </label>
            <button
              className="secondary"
              disabled={busy || !checkpoint.obligationId || !obligationReadback?.terms_digest || obligationReadback.accepted}
              onClick={() => submit("Accept obligation terms", "accept_obligation", [checkpoint.obligationId, obligationReadback?.terms_digest])}
            >
              Accept exact digest
            </button>
            {obligationReadback && (
              <dl className="termsReadback">
                <div>
                  <dt>Identity + requirement</dt>
                  <dd>
                    {obligationReadback.kind} · {obligationReadback.obligation_key}
                    <br />
                    {obligationReadback.title}
                    <br />
                    {obligationReadback.requirement}
                  </dd>
                </div>
                <div>
                  <dt>Evidence policy</dt>
                  <dd>
                    {obligationReadback.authority_origin}
                    <br />
                    {obligationReadback.evidence_url}
                    <br />
                    Marker: {obligationReadback.object_marker}
                  </dd>
                </div>
                <div>
                  <dt>Financial SLA terms</dt>
                  <dd>
                    SLA Bond: {obligationReadback.bond_amount_wei ?? 0} wei | Funded: {obligationReadback.funded_bond_wei ?? 0} wei
                    <br />
                    Breach Penalty: {obligationReadback.penalty_per_breach_wei ?? 0} wei
                  </dd>
                </div>
              </dl>
            )}
          </div>
        </article>

        {/* CARD 03: LIVE CHECKPOINT & CONSENSUS */}
        <article className="workCard">
          <div className="cardTitle">
            <span>03</span>
            <div>
              <small>LIVE CHECKPOINT</small>
              <h2>Observe, judge, reconcile</h2>
            </div>
          </div>
          <div className="checkpointRow">
            <label>
              Obligation ID
              <input value={checkpoint.obligationId} onChange={(e) => setCheckpoint({ ...checkpoint, obligationId: e.target.value })} />
            </label>
            <button
              className="secondary"
              disabled={busy || !checkpoint.obligationId || !obligationReadback?.accepted}
              onClick={() => submit("Open checkpoint", "open_due_checkpoint", [checkpoint.obligationId], (id) => setCheckpoint({ ...checkpoint, checkpointId: id }))}
            >
              Open due checkpoint
            </button>
          </div>
          <div className="checkpointRow">
            <label>
              Checkpoint ID
              <input
                value={checkpoint.checkpointId}
                onChange={(e) => {
                  setCheckpoint({ ...checkpoint, checkpointId: e.target.value });
                  setCheckpointReadback(null);
                }}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !checkpoint.checkpointId || !checkpointReadback?.windowComplete || !["OPEN", "UNRESOLVED"].includes(checkpointReadback.status)}
              onClick={() => submit("Assess checkpoint", "assess_checkpoint", [checkpoint.checkpointId])}
            >
              Run AI consensus
            </button>
          </div>
          {checkpointReadback && (
            <div className="guardrail">
              <Activity />
              <p>
                <b>Sealed window:</b> {new Date(checkpointReadback.window_start * 1000).toLocaleString()} → {new Date(checkpointReadback.window_end * 1000).toLocaleString()}.<br />
                Status: <code>{checkpointReadback.status}</code>. Result: <code>{checkpointReadback.semantic_state}</code>.
                {checkpointReadback.settlement_status && (
                  <>
                    <br />
                    <b>Settlement:</b> <code>{checkpointReadback.settlement_status}</code> ({checkpointReadback.remedy_amount_wei ?? 0} wei)
                  </>
                )}
                <br />
                {!["OPEN", "UNRESOLVED"].includes(checkpointReadback.status)
                  ? "This checkpoint is terminal; standing and settlement are permanently recorded."
                  : checkpointReadback.windowComplete
                  ? "Assessment window complete. Click 'Run AI consensus'."
                  : "Sync after window end time to enable assessment."}
              </p>
            </div>
          )}
          <div className="guardrail">
            <ShieldAlert />
            <p>
              <b>Fail-Closed Security:</b> Missing, mismatched or interval-unverifiable evidence results in <code>UNRESOLVED</code> with <code>FAIL_CLOSED_HOLD</code> (zero collateral lost). Breaches require positive contradictory facts.
            </p>
          </div>
        </article>

        {/* CARD 04: SLA ESCROW VAULT & FINANCIAL SETTLEMENT */}
        <article className="workCard">
          <div className="cardTitle">
            <span>04</span>
            <div>
              <small>SLA ESCROW VAULT & FINANCIAL SETTLEMENT</small>
              <h2>Solvency & pull-payment claims</h2>
            </div>
          </div>
          <div className="consentBox" style={{ marginTop: 0 }}>
            <div>
              <b>Fund Obligation SLA Bond</b>
              <p>Service provider locks performance collateral into the contract. 1:1 reservation guarantees solvency.</p>
            </div>
            <div className="two">
              <label>
                Obligation ID
                <input value={bondFunding.obligationId} onChange={(e) => setBondFunding({ ...bondFunding, obligationId: e.target.value })} placeholder="e.g. 0" />
              </label>
              <label>
                Bond amount (wei)
                <input value={bondFunding.amountWei} onChange={(e) => setBondFunding({ ...bondFunding, amountWei: e.target.value })} placeholder="e.g. 1000" />
              </label>
            </div>
            <button
              className="primary wide"
              disabled={busy || !bondFunding.obligationId || !bondFunding.amountWei}
              onClick={() => submit("Deposit SLA bond", "deposit_obligation_bond", [bondFunding.obligationId, Number(bondFunding.amountWei)])}
            >
              <Coins /> Deposit SLA performance bond
            </button>
          </div>

          <div className="consentBox" style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
            <div>
              <b>Your Claimable Balance (Pull-Payment)</b>
              <p>Liquidated damages and released retainers are credited here. Beneficiaries pull directly to their wallet.</p>
              <h2 style={{ color: "#10b981", margin: "8px 0" }}>{userClaimable} wei available</h2>
            </div>
            <button className="primary wide" style={{ background: "#10b981", borderColor: "#059669" }} disabled={busy || userClaimable <= 0} onClick={() => submit("Withdraw claimable balance", "withdraw_balance", [])}>
              <ShieldCheck /> Withdraw credited remedies to wallet
            </button>
          </div>
        </article>
      </section>
    </main>
  );
}

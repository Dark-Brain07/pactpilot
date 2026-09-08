# Threat model

## Protected assets

Agreement identity, counterparty binding, source policy, checkpoint sequence, semantic standing and append-only observation history.

## Adversaries

- owner attempting to bind a deceptive source;
- unrelated caller attempting to mutate configuration;
- source publishing content for the wrong object;
- evidence containing prompt injection;
- stale checkpoint or observation attempting to overwrite a terminal result;
- model returning malformed or internally inconsistent output;
- frontend inferring IDs or showing optimistic success.

## Controls

- exact normalized HTTPS origin and URL prefix;
- two-stage counterparty consent: agreement acceptance, then acceptance of an
  immutable digest covering the exact obligation, source policy and schedule;
- required object marker and validator-local fetched snapshot hash;
- independent validator refetch and semantic recomputation;
- immutable agreement-version and checkpoint-sequence binding; a new agreement
  version is a new agreement record in the MVP;
- checkpoints cannot open before exact obligation consent and cannot be assessed
  before the sealed observation window ends;
- positive results require scope match and sufficient coverage;
- source/model failure becomes `UNRESOLVED`;
- frontend decodes finalized return IDs and reconciles authoritative readback.

## Residual risks

An authority-controlled page can publish false information within its attestation scope. A single source cannot establish continuous uptime or comprehensive legal compliance. Public rendering can change between validators. Production deployments should choose obligation-specific multi-source policy before making stronger assurance claims.

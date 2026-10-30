# Monday Morning Revision Sheet (one page, 15 min read)

**Your positioning in one sentence:** *"I'm a security enablement architect who has been both the SE and the enabler, and I build field readiness from the packet flow up to the business metric."*

## Prisma SASE in 30 seconds
Prisma SASE = **Prisma Access** (SSE: cloud PAN-OS NGFW, SWG, CASB, ZTNA 2.0, DLP) + **Prisma SD-WAN** (ION, app-defined) + **Strata Cloud Manager** (management, AIOps) + **ADEM** (experience) + **CIE** (identity) + **Strata Logging Service** (logs).

## Prisma Access building blocks
| Term | One line |
|---|---|
| Mobile Users | GlobalProtect / Prisma Access Agent ⚠️ / Explicit Proxy (PAC) / Browser |
| Remote Networks | Branch IPsec (static/BGP) into an RN-SPN; ION auto-tunnels |
| Service Connection | IPsec + **BGP** to DC; route to private apps + **return path**; not general egress |
| ZTNA Connector | Outbound VM, app targets by FQDN/IP, no routing, overlapping IPs OK, no server-initiated flows ⚠️ |
| Infrastructure subnet | Your non-overlapping RFC 1918 block for internal routing |
| Location vs. compute | Where you connect vs. where processing runs; drives egress IP and latency |
| Internal DNS | Define internal domains + DNS servers (reached via SC) |
| CIE | Directory sync + SAML authentication; groups for policy |
| HIP | Device posture → HIP profiles in rules |

## PAN-OS core
- **App-ID:** port → signatures → decrypt → decoders → heuristics; app shift; `application-default`; Policy Optimizer; avoid app override.
- **User-ID:** sources = AD logs, GP, Auth Portal, TS agent, syslog (ISE), XML API, XFF; group mapping via LDAP/CIE; Dynamic User Groups.
- **Content-ID:** AV, Anti-Spyware (+DNS Security), Vuln, URL, File Blocking, WildFire, Data Filtering. Profile groups on **every allow rule**. Single-pass.
- **Policy gotcha:** NAT evaluated first; security uses **pre-NAT IP, post-NAT zone**.
- **Decryption:** Forward Proxy / Inbound Inspection / SSH Proxy; exclusions for pinned apps and privacy categories.

## ZTNA 2.0 (five principles → config)
Least privilege (App-ID rules) · Continuous trust (HIP re-eval) · Continuous inspection (profiles on private-app rules) · Protect all data (DLP) · Secure all apps (SC + connector + browser). *Don't overclaim. Competitors have closed some gaps.*

## Prisma SD-WAN in 20 seconds
Per-app session identification + **per-app** performance on every path → path policy + performance thresholds. vs. Catalyst (BFD probes per tunnel, SLA classes) and SSR (session-based, tunnel-free). **Prisma SD-WAN ≠ PAN-OS SD-WAN plugin.**

## Scenario B order
Scope → client/split tunnel → **DNS** → logs (no log / deny / `incomplete`) → SC tunnel + **BGP** + **return route for MU pool** / connector health → app ACLs, MTU → fix + runbook + lab.

## Scenario D skeleton
Tiers (Champions / Core / Broad) · Phases: Define (−90) → Build + Champions (−60) → Launch waves (−30) → Reinforce (GA+) · Validation: lab with automated checker + design defense · Metrics: reach → learning → behavior (POV win rate, escalations/opportunity) → results (pipeline, attach, time-to-first-deal) · Risks: product slip, lab scale, SE time, AI accuracy.

## Mapping cheat line
Secure Access/Umbrella ↔ Prisma Access · Secure Client ↔ GlobalProtect · Resource Connector ↔ ZTNA Connector · ISE/pxGrid ↔ User-ID/CIE (consumer, not NAC) · Firepower Snort/AMP ↔ Content-ID/WildFire · SRX AppSecure ↔ App-ID · Catalyst/SSR ↔ Prisma SD-WAN · FMC/Security Director ↔ Panorama · SCC/Mist cloud ↔ SCM · ThousandEyes/Marvis ↔ ADEM (partial).

## Behavioral reminders
STAR, 2 minutes, end with **lesson + where you applied it**. No invented metrics. Stories: ZTA Design Clinic · Cisco global readiness · Juniper SE technical problem · influencing PM/Eng · inclusive design.

## Before you walk in
- Pick one ⚠️ item you verified this weekend and mention it naturally (shows currency).
- Have your 5 questions ready (file 06 §4).
- When unsure: "My understanding as of the current release is X. I'd verify Y in the docs before committing in a design." That's credible, not weak.

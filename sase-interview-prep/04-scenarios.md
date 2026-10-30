# Technical Architecture Scenarios

**How to use this file:** For each scenario, *first* answer the "Your turn" prompts out loud or on paper (10–15 min). *Then* read the reference design. In mock interview mode I'll ask these one at a time and challenge your tradeoffs. Don't memorize the reference answer. Defend your own choices.

---

## Scenario A: Enterprise SASE transformation

**Situation.** 20 branches, 500 remote employees, Microsoft 365, and private data center applications. All branch internet traffic is backhauled over MPLS to the DC security stack, and remote users use a legacy VPN concentrator. Goals: eliminate the backhaul and improve Zero Trust access.

### Your turn
1. What discovery questions do you ask first? Name at least six.
2. Draw the target architecture.
3. How do you phase the migration? What are the rollback points?
4. Where do you inspect branch-to-DC traffic, and why?
5. Defend SC vs. ZTNA Connector for the DC apps.
6. What are your success metrics?

### Reference design
**Discovery (the questions that change the design):**
- App inventory: which private apps, which protocols, any server-initiated flows? Any IP-allow-listed SaaS apps?
- Identity: IdP (Entra ID?), on-prem AD, MFA, device management (Intune?), EDR?
- WAN: circuits per branch, contract end dates for MPLS, any existing SD-WAN?
- Compliance: data residency, decryption constraints (works council, regulated industries)
- Ops model: who owns firewall vs. network vs. endpoint? Panorama in place?
- Performance: Teams/Zoom volume, latency-sensitive apps (VDI, voice)

**Target architecture:**
- **Branches:** Prisma SD-WAN ION (broadband + LTE; keep MPLS during the transition). Native auto-tunnels to Prisma Access remote networks. Path policy: M365 and internet → Prisma Access; DC apps → SD-WAN fabric to a DC ION (or via Prisma Access → SC, depending on the inspection decision).
- **Remote users:** GlobalProtect (or Prisma Access Agent ⚠️), always-on, SAML via CIE to Entra ID, HIP checks (EDR, encryption, OS version).
- **DC:** two service connections (HA) with eBGP. Ensure the DC routes the MU pools and RN subnets back via the SCs. Add **ZTNA Connectors** for any cloud-hosted apps.
- **Policy (ZTNA 2.0):** group-based, App-ID rules for private apps, HIP-gated sensitive apps, best-practice profile groups on every allow rule, decryption with documented exclusions, Enterprise DLP on M365 and web uploads, tenant restrictions for M365.
- **Management:** SCM cloud-managed; Strata Logging Service → SIEM; ADEM for users and sites.

**Branch-to-DC inspection, the key tradeoff:**
- *Option 1: via Prisma Access (RN → SC).* Consistent policy and logs in one place, but you take a cloud hop. Latency is fine when the SC location is near the DC.
- *Option 2: via the SD-WAN fabric, inspected by the DC NGFW.* Lower latency, and it reuses the existing DC NGFW, but you have two policy points.
- 🔶 Recommendation: Option 2 initially (lower risk, keep the existing DC controls), with a roadmap to Option 1 for apps migrating to the cloud. Say out loud that you'd decide per app class.

**Phasing:**
1. **Foundation (weeks 0–4):** CIE + IdP, SCs up, BGP validated, logs flowing, policy baseline converted from existing rules (use Policy Optimizer for any existing PAN-OS rules).
2. **Remote users pilot (weeks 4–8):** IT group first, then a 10% wave. VPN concentrator kept as rollback. Success = auth success, private app reachability, ADEM scores.
3. **Branch pilot (weeks 6–12):** 2 branches with different profiles (large and small). MPLS kept for DC traffic, local internet breakout via Prisma Access.
4. **Scale (weeks 12–24):** remaining branches in waves. Retire the backhaul. Decommission the VPN concentrator.
5. **Optimize:** ZTNA Connectors for cloud apps, DLP tuning, MPLS reduction.

**Metrics:** % of internet traffic no longer backhauled, M365 latency (ADEM), DC bandwidth reduction, % of rules App-ID based (vs. port), % of sessions decrypted, private app access tickets, MPLS cost trajectory, time to onboard a new branch.

**Follow-ups I'll throw at you:** "The CFO wants MPLS gone in 3 months. Push back or comply?" · "The works council forbids decryption in Germany." · "The DC firewall team refuses to change BGP."

---

## Scenario B: Prisma Access troubleshooting

**Situation.** A remote employee authenticates successfully (GlobalProtect is connected) but can't access a private application.

### Your turn
Walk through your troubleshooting workflow. Be explicit about the order, and about what evidence rules each layer in or out.

### Reference workflow (layered, evidence-driven)

**0. Scope it first (2 minutes saves 2 hours).**
- One user or many? One app or all private apps? Since when? What changed (policy push, DC change, agent upgrade)?
- By FQDN *and* by IP? What's the error: DNS failure, timeout, reset, or HTTP 403?

**1. Client and tunnel.**
- GlobalProtect connected to which gateway/location? Got an IP from the MU pool?
- **Split tunnel:** is the app's domain or IP being *excluded* (sent outside the tunnel)? This is very common. Check the split-tunnel includes and excludes, and the routing table on the endpoint.
- HIP report submitted? (HIP can be correct for auth yet fail the HIP profile on a rule.)

**2. DNS.**
- Does the FQDN resolve? To the *internal* IP? Prisma Access **internal DNS** config must list the domain (for example, `corp.local`) and point to internal DNS servers reachable via the SC.
- Is the client using the tunnel's DNS or a local resolver? Split DNS mistakes are the #1 "works by IP, fails by name" cause.
- For ZTNA Connector: is the app target defined by FQDN/wildcard and resolvable from the connector's site?

**3. Identity and policy (Prisma Access logs in SCM / Strata Logging Service).**
- Search **traffic logs** for source = user's MU IP or username. Is there a session? What's the **rule matched**, the **action**, and the **application**?
- No log at all → the traffic never reached the SPN (go back to step 1).
- Deny → which rule? Common causes: the user isn't in the expected **group** (CIE sync scope or group mapping delay), a **HIP profile** mismatch, App-ID mismatch (the rule allows `web-browsing` but the app is identified as `ssl` or a custom app; or `application-default` blocks a non-standard port), or the wrong **destination zone/address object**.
- Allowed but `incomplete` / `aged-out` with no server response → routing or return path (step 4).
- Threat or URL logs: was the traffic blocked by a **profile** (vulnerability signature false positive, file blocking)?
- Decryption logs: certificate/pinning errors if decryption is applied to the internal app.

**4. Routing and connectivity.**
- **Service connection:** IPsec tunnel up? **BGP established?** Is Prisma Access learning the app's prefix? (Check the SC status and the routes learned in SCM/Panorama.)
- **Return path:** does the DC route the **MU IP pool** back to the SC? Check the DC routing table and any more-specific route via the legacy VPN or the internet edge. Asymmetric return through a stateful DC firewall drops the session.
- Is there a DC firewall between the SC termination and the app that denies the MU pool? (Its logs will show this.)
- Overlapping subnets: does the MU pool or infrastructure subnet overlap DC space?
- **ZTNA Connector:** connector group healthy? Tunnels up? App target status? Can the connector itself reach the app (DNS, ACLs on the server allowing the connector's IP)?

**5. Application.**
- Server-side ACL or host firewall only allowing old VPN pool ranges? (Common post-migration.)
- App requires server-initiated connections (doesn't work through the connector)?
- MTU/MSS: large responses fail while small ones succeed (IPsec overhead). Look for TCP sessions that establish and then stall.

**6. Fix, verify, and prevent.**
- Fix, then validate with the user. Add the case to a runbook. If it was a policy or config pattern, add a Policy Analyzer / pre-change check or a lab exercise.

🔶 **The enablement angle (say this in the interview):** "This is exactly the scenario I'd turn into a lab with injected faults (split-tunnel exclusion, missing internal DNS domain, return-path route, HIP mismatch, App-ID mismatch) and assess SEs on time-to-root-cause and evidence used, not on whether they know the answer."

**Follow-ups:** "Logs show `allow` with application `incomplete`." (TCP handshake didn't complete → routing or return path.) · "Works for everyone except users in Singapore." (Location- or SC-specific routing; DNS in that region.) · "Works by IP, not by name." (DNS.)

---

## Scenario C: NGFW secure application access

**Situation.** Design secure access to an internal three-tier app (web → app → DB) for: employees (read), finance (read/write), contractors (read only, limited), and admins (SSH/RDP to servers). Use App-ID, User-ID, security policy, threat prevention, and segmentation.

### Your turn
1. Zone design. 2. Rule base (in order). 3. Identity sources. 4. Profiles and decryption. 5. How you'd migrate from an existing port-based rule set.

### Reference design
**Zones:** `Users-Campus`, `Users-Remote` (or Prisma Access), `Contractors`, `DMZ-Web`, `App`, `DB`, `Mgmt`. Use separate zones per tier so tier-to-tier traffic is interzone and inspected. Add **Dynamic Address Groups** tagged by workload (VM tags via VM Information Sources or cloud tags) so policy follows workloads.

**Identity:** User-ID via ISE syslog/pxGrid (campus) ⚠️, GlobalProtect (remote), group mapping via LDAP or CIE. Contractors get a dedicated IdP group plus Prisma Access Browser or GP with strict HIP.

**Rules (top-down, all allow rules carry profile group `strict`):**
| # | Source | User | Destination | Application | Service | Action |
|---|---|---|---|---|---|---|
| 1 | Users-* | Finance | DMZ-Web (app VIP) | custom-app-finance-write (custom App-ID) or `web-browsing`/`ssl` with URL path controls | application-default | Allow |
| 2 | Users-* | Employees | DMZ-Web | web-browsing, ssl | application-default | Allow |
| 3 | Contractors | Contractors-AppX | DMZ-Web | web-browsing, ssl + HIP profile `managed-or-browser` | application-default | Allow |
| 4 | DMZ-Web | — | App | custom-app-api (or `web-browsing`) | specific ports | Allow |
| 5 | App | — | DB | mssql-db / oracle / postgres | application-default | Allow |
| 6 | Mgmt / Users-* | IT-Admins + HIP | App, DB, DMZ-Web | ssh, ms-rdp | application-default | Allow (MFA via authentication policy) |
| 7 | any | any | App, DB | any | any | Deny + log |

**Threat prevention:** Vulnerability Protection (strict, with blocking for server-side critical/high), Anti-Spyware with DNS Security sinkhole, AV, WildFire, and File Blocking (block PE/scripts uploaded to the web tier). **Inbound SSL inspection** on the web tier (you hold the server key/cert). Forward proxy for users.

**Authentication policy:** MFA on admin protocols ✅ (PAN-OS Authentication Policy + MFA vendor integration).

**Migration from port-based:** run **Policy Optimizer** to see which apps are actually used on port-based rules, create App-ID rules above them, monitor hit counts, then disable the port-based rules. Plan for custom App-IDs for in-house apps.

**Tradeoffs to defend:** zone granularity vs. operational complexity; custom App-IDs vs. `web-browsing` + URL filtering; decryption cost vs. visibility; Dynamic Address Groups (automation dependency) vs. static objects.

---

## Scenario D: Global SE product launch, 90-day technical readiness

**Situation.** Palo Alto introduces a new security capability. You must make 1,000 global SEs technically ready within 90 days: labs, competency validation, launch timeline, and success metrics.

### Your turn
Present your strategy in 5 minutes: phases, audiences, assets, validation, metrics, risks. Then defend it.

### Reference strategy (structure to adapt; use your own Cisco and Juniper approach)

**Principles (🔶 your stance):**
1. Readiness is a *field outcome*, not course completion.
2. Tier the audience. Not all 1,000 SEs need the same depth.
3. Start with engineering truth: build from PM/Eng/TME source material, and gate content on product reality (beta builds, known limitations).
4. Practice beats presentation: hands-on labs and simulations are the core.

**Audience segmentation:**
| Tier | Who | Size (illustrative) | Target proficiency |
|---|---|---|---|
| T1 Champions | Specialists, early-adopter SEs, TMEs | ~50 | Expert: can run POVs and teach |
| T2 Core SEs | Territory SEs in target segments | ~600 | Practitioner: position, design, demo, run a guided POV |
| T3 Broad | Other SEs, partners (later wave) | ~350+ | Foundational: identify and qualify opportunities, explain value and fit |

**Phases:**
| Phase | Days | Activities | Exit criteria |
|---|---|---|---|
| **1. Define** | −90 to −60 | Align with PM/Eng/TME/GTM on target use cases, ICP, competitive set, GA scope and known limitations. Build a **competency model** (knowledge, skills, observable behaviors per tier). Define metrics with GTM leadership. Lab architecture plan. | Signed-off competency model; metric baseline; content plan; lab design reviewed by Eng |
| **2. Build + Champions** | −60 to −30 | Champions get beta access, deep dives with Eng, and help co-build labs (lab-as-code: automated provisioning and validation). Build a modular path: micro-learning → architecture workshop → hands-on lab → scenario simulation. Draft a demo script and a POV guide. | Champions certified; labs pass the reliability test (for example, a successful run rate in a pilot cohort); content tech-reviewed by PM/Eng |
| **3. Launch readiness** | −30 to GA | T2 waves by region (time zones): live architecture workshops led by champions, labs, and **AI-assisted simulations** (for example, a customer objection role-play grounded only on approved content). Competency validation: hands-on lab assessment + scenario-based design defense. | ≥ target % of T2 validated at Practitioner before GA (for example, 70%; set it with leadership) |
| **4. Field reinforcement** | GA to +30 (and beyond the 90 days) | T3 foundational path, partner enablement, office hours, POV support channel with champions, win/loss and field feedback loops to PM. Update content for fixes and new features. | Field adoption metrics trending; feedback closed-loop |

**Competency validation (not quizzes alone):**
- Hands-on lab with an automated checker (configuration state validated via API).
- A scenario design defense: given a customer brief, the SE presents an architecture and is scored on a rubric (accuracy, design tradeoffs, positioning).
- Practitioner badge, with an optional path to certification.

**Metrics ladder:**
| Level | Metric |
|---|---|
| Activity / reach | % of target SEs enrolled and completed per tier |
| Learning | Lab pass rate, assessment scores, pre/post confidence |
| Behavior (leading) | # of SEs who have run a demo or POV, POV technical win rate, design reviews submitted, escalations to specialists *per opportunity* (should fall) |
| Results (lagging) | Pipeline created with the capability attached, time from GA to first deals, attach rate, win rate vs. competitors (correlated, not causal) |
| Quality | Field-reported content defects, CSAT, time to update content after a product change |

🔶 Be explicit that enablement *correlates with* rather than *causes* revenue. Use cohort comparisons (validated vs. not-yet-validated SEs) to strengthen the claim.

**Risks and mitigations:**
- Product slips or changes → modular content and a "known limitations" page kept current, versioned with each release.
- Lab capacity and reliability for 1,000 SEs → lab-as-code, load testing with champions, scheduled waves.
- SE time scarcity → micro-learning, regional scheduling, manager sponsorship, tie to quota-relevant use cases.
- AI accuracy → retrieval-grounded only on approved sources, human SME review, citation required, red-teamed before release.

**Follow-ups:** "PM says the feature won't be stable until 2 weeks before GA. What do you do?" · "Sales leadership wants everyone certified by GA. Is that realistic?" · "How do you prove the program worked six months later?"

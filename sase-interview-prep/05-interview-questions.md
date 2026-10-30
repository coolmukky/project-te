# The 20 Most Likely Technical and Situational Questions, with Answer Frameworks

Each entry gives a **framework** (the structure to hit), not a script. Fill it with your own words and experience. Cross-references point to the detailed material.

**Universal structure for technical answers (🔶):** *Context → Mechanism → Palo Alto specifics → Tradeoff → Example from your experience → Enablement angle.* That last step is what separates you from a pure-engineer candidate.

---

### Technical: architecture and product

**1. "Explain Prisma SASE and how it differs from an SSE built on proxies."**
- SSE vs. SASE in one sentence each
- Three onboarding paths (MU, RN, SC/connector) and one PAN-OS policy engine
- Full L3–L7 on all ports vs. HTTP/S-centric proxy. Be fair: proxies are strong on web, and Prisma Access also offers explicit proxy.
- Operational convergence: SCM, CIE, Strata Logging Service, ADEM
- → file 02 §2–4, file 03 §1

**2. "Walk me through a mobile user accessing a private app."**
- Agent → portal/gateway → MU-SPN → policy (user, App-ID, HIP, profiles) → backbone → SC → DC (or connector)
- Call out **DNS** and **return routing** without being asked
- → file 03 §6 Flow 3–4

**3. "Service connection vs. ZTNA Connector: when do you use each?"**
- Routing vs. app-targeting, inbound exposure, overlapping IPs, server-initiated flows, transit
- "Usually both": SC for the core DC, connectors for cloud and app enclaves
- → file 02 §11

**4. "How does App-ID work, and how do you migrate a customer from port-based rules?"**
- Pipeline: port → signatures → decryption → decoders → heuristics, plus app shift
- `application-default`, dependencies, custom App-IDs, avoid app override
- Policy Optimizer workflow
- Your SRX AppSecure / Firepower comparison
- → file 02 §5.1

**5. "How does User-ID work in Prisma Access vs. on-prem, and how would you integrate Cisco ISE?"**
- Mapping vs. group mapping, the sources, CIE
- GP is authoritative for remote users. Branch users need a mapping source.
- ISE via syslog/pxGrid integration ⚠️, with ISE remaining NAC for campus. This is your differentiator, so use it.
- → file 02 §5.2

**6. "What is ZTNA 2.0? Be specific."**
- The five principles → map each to a concrete config (App-ID rules, HIP re-eval, profiles on private app rules, DLP, connectors + browser)
- Acknowledge what competitors now also do. Credibility beats hype.
- → file 02 §12

**7. "Design decryption for Prisma Access with Microsoft 365."**
- Forward proxy for general web; exclusions for pinned apps, privacy categories, and Microsoft "Optimize" media (often split-tunneled ⚠️)
- Tenant restrictions require decryption or header insertion, so you have to decrypt that traffic
- Certificate distribution via MDM, and decryption logs for troubleshooting
- Phased approach: by category, with measurement

**8. "How does Prisma SD-WAN choose a path for an application?"**
- Per-app session ID, per-app performance on every path, path policy + performance thresholds
- Contrast with BFD/SLA-class probes (Catalyst) and session-based tunnel-free (SSR)
- Distinguish Prisma SD-WAN from PAN-OS SD-WAN
- → file 02 §10

**9. "Strata Cloud Manager vs. Panorama: what would you recommend and why?"**
- Greenfield → SCM. Large mature Panorama estate → coexistence with a migration path.
- Folders/snippets vs. device groups/templates. AIOps.
- Verify feature parity
- → file 02 §13

**10. "How would you troubleshoot slow SaaS performance for remote users?"**
- ADEM segment breakdown (device, Wi-Fi, ISP, Prisma Access, app)
- Location and egress geography, decryption overhead, split tunnel for media
- Compare with ThousandEyes from your Cisco experience
- → file 02 §14

### Technical: troubleshooting and design scenarios

**11. "A user authenticates but can't reach a private app." (Scenario B)**
- Scope → client/split tunnel → DNS → logs (rule, app, action) → routing/return → app → prevent
- Give a deny-vs-incomplete-vs-no-log interpretation
- → file 04 Scenario B

**12. "Design SASE for 20 branches + 500 remote users + M365 + DC apps." (Scenario A)**
- Discovery questions first, then architecture, phasing, rollback, metrics
- → file 04 Scenario A

**13. "Design segmentation for a three-tier app with mixed user populations." (Scenario C)**
- Zones per tier, identity sources, rule table, profiles, inbound inspection, MFA on admin protocols
- → file 04 Scenario C

**14. "A customer has Cisco ISE + TrustSec on campus and wants Prisma Access. How do you keep identity-based segmentation consistent?"**
- ISE stays the campus NAC and policy source. Share identity to PAN-OS via User-ID integration. Consider SGT-to-tag mapping ⚠️ (verify the current integration options).
- Remote: CIE + IdP + HIP
- One group taxonomy across both, or you'll get policy drift
- 🔶 A great place to show both-sides depth

### Situational: enablement strategy and leadership

**15. "Design a 90-day readiness program for a new capability for 1,000 SEs." (Scenario D)**
- Tiers, phases with exit criteria, labs, validation, metrics ladder, risks
- → file 04 Scenario D

**16. "How do you decide what technical skills SEs must develop?"**
- Start from **field moments that matter**: discovery, design, demo, POV, troubleshooting, competitive objection
- Derive the competency model from top-performer behavior + PM/TME input + win/loss data + escalation data
- Prioritize by business impact × gap size × frequency
- Validate with observable performance, not self-assessment

**17. "How do you measure whether technical enablement works?"**
- Ladder: reach → learning → behavior → results
- Leading indicators: POV technical win rate, escalations per opportunity, time to first deal, design review quality
- Cohort comparison and honesty about correlation vs. causation
- Close the loop: metrics change the program

**18. "Product Management disagrees with your readiness plan or won't give you access before GA. How do you influence them?"**
- Frame it around *their* goals: launch success, adoption, fewer escalations, quality field feedback
- Offer value: structured field feedback, a champion network as beta testers, early signals of usability issues
- Data: escalation rates from past launches
- Escalation path only as a last resort, with a documented tradeoff

**19. "How would you use AI to improve technical readiness without compromising accuracy?"**
- Use cases: scenario simulations (customer role-play), adaptive lab hints, assessment generation, content update detection when release notes change, a field Q&A assistant
- Guardrails: retrieval grounding on approved, versioned sources; citations required; SME review of generated assessments; confidence thresholds and escalation to humans; red-teaming for hallucinations on product limits; evaluation sets per release
- Measure it: accuracy eval scores, deflection with correctness audits
- Mention Palo Alto's own AI direction (for example, the SCM AI assistant ⚠️) as both a teaching subject and a tool

**20. "Tell me about the hardest technical tradeoff you made in an enablement program."**
- Depth vs. reach, lab realism vs. reliability and cost, speed vs. accuracy pre-GA
- Use a real story from file 06 (for example, the ZTA Design Clinic scope decision)
- End with what you'd do differently

---

## Bonus questions to rehearse (if time permits)
- "What's Palo Alto's biggest competitive threat in SASE and how would you prepare SEs for it?" (🔶 Zscaler in SSE, Cisco and Fortinet in converged SASE, Netskope. Teach SEs to win on architecture, not on bashing competitors.)
- "How do you keep enablement current with a monthly release cadence?"
- "How would you enable partners differently from SEs?"
- "How do you design a lab that scales to 1,000 concurrent learners?"

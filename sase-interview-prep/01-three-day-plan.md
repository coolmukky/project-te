# Three-Day Accelerated Learning Plan

> **Link note.** The links below point to the official Palo Alto Networks TechDocs (docs.paloaltonetworks.com) and product pages. TechDocs gets reorganized often, so if a deep link has moved, start from the product's TechDocs home and search for the topic name shown in **bold**. ⚠️ Check that each link resolves before you depend on it.

### Core official sources (bookmark these first)
| Source | URL |
|---|---|
| Prisma Access TechDocs | https://docs.paloaltonetworks.com/prisma-access |
| Prisma SD-WAN TechDocs | https://docs.paloaltonetworks.com/prisma-sd-wan |
| Strata Cloud Manager TechDocs | https://docs.paloaltonetworks.com/strata-cloud-manager |
| PAN-OS TechDocs (App-ID, User-ID, policy, decryption) | https://docs.paloaltonetworks.com/pan-os |
| GlobalProtect TechDocs | https://docs.paloaltonetworks.com/globalprotect |
| Cloud Identity Engine | https://docs.paloaltonetworks.com/cloud-identity |
| Autonomous DEM | https://docs.paloaltonetworks.com/autonomous-dem |
| Enterprise DLP | https://docs.paloaltonetworks.com/enterprise-dlp |
| SaaS Security | https://docs.paloaltonetworks.com/saas-security |
| Best Practices | https://docs.paloaltonetworks.com/best-practices |
| Prisma SASE product pages | https://www.paloaltonetworks.com/sase |
| ZTNA 2.0 overview | https://www.paloaltonetworks.com/sase/ztna |
| Beacon (Palo Alto learning platform) | https://beacon.paloaltonetworks.com |
| Certifications | https://www.paloaltonetworks.com/services/education/certification |
| Live Community (Prisma Access / NGFW discussions) | https://live.paloaltonetworks.com |
| Job description | https://jobs.paloaltonetworks.com/en/job/santa-clara/technical-enablement-architect-network-security-and-sase/47263/96174876336 |

---

## FRIDAY, OCT 30: Technical foundations and product mapping (about 7 h)

### Learning objectives
By the end of Friday you can:
1. Explain SASE vs. SSE and draw the Prisma SASE portfolio from memory.
2. Draw Prisma Access with MU, RN, SC, ZTNA Connector, CIE, and SCM, and explain what each is for.
3. Explain App-ID, User-ID, and Content-ID at the mechanism level (how classification works, not just what it is).
4. Explain ZTNA 2.0 vs. 1.0 in engineering terms.
5. Map each Palo Alto component to its Cisco and Juniper counterpart, and say whether it's a direct, partial, or functional equivalent.

### Schedule and priority
| Time | Priority | Topic | Material |
|---|---|---|---|
| 0:00–0:45 | P0 | SASE vs. SSE, Prisma SASE portfolio | `00-START-HERE.md` §4; https://www.paloaltonetworks.com/sase |
| 0:45–3:15 | P0 | Prisma Access architecture | `03-prisma-sase-architecture.md` §1–5; Prisma Access TechDocs → **Prisma Access Overview**, **Mobile Users**, **Remote Networks**, **Service Connections**, **ZTNA Connector**, **Prisma Access Locations** |
| 3:15–3:30 | — | Break | |
| 3:30–5:30 | P0 | NGFW core: App-ID, User-ID, Content-ID, policy, decryption | `02-technology-mapping.md` §5–6; PAN-OS Admin Guide → **App-ID**, **User-ID**, **Security Profiles**, **Decryption**, **Policy Optimizer** |
| 5:30–6:15 | P1 | ZTNA 2.0 | `02-technology-mapping.md` §12; https://www.paloaltonetworks.com/sase/ztna |
| 6:15–7:00 | P0 | Mapping table rehearsal | `02-technology-mapping.md` §1. Cover the Palo Alto column and recite it. |

### Architecture example: "Hello World" Prisma Access
- 1 service connection to the HQ data center (IPsec + eBGP; advertises 10.0.0.0/8 to Prisma Access)
- 2 remote networks (branches with ION devices in two regions)
- Mobile Users via GlobalProtect in 3 Prisma Access locations
- CIE syncing Entra ID groups; SAML authentication to Entra ID
- Security policy: `Engineering` group → `ssh, git, jira` to DC; `All-Users` → `office365-enterprise-access` with DLP profile; `All-Users` → internet with URL Filtering + Threat Prevention + DNS Security profiles

### Practical exercises
1. **Whiteboard drill (15 min).** On blank paper, draw the example above, including IP pools for mobile users, the infrastructure subnet, BGP peering at the SC, and where logs go. Compare it to file 03.
2. **Policy rewrite (20 min).** Take a typical SRX or Firepower port-based rule (`any → DC, tcp/443, permit`) and rewrite it as a PAN-OS rule that uses App-ID, User-ID groups, `application-default`, and a security profile group. Explain why `application-default` is better than `any`.
3. **Mapping recitation (15 min).** Cover the Palo Alto column of the mapping table and name each equivalent and its equivalence type.
4. **Free hands-on option.** In Beacon, search for the free **Prisma Access** and **Firewall Essentials** digital learning. ⚠️ Course names change, so search "Prisma Access" and "PAN-OS". Even 30 minutes of UI screenshots will help you sound as though you've used it.

### Interview questions for Friday
1. "Walk me through Prisma SASE as if I were a Cisco-trained SE joining Palo Alto."
2. "How does App-ID identify an application that runs over TLS?"
3. "What is ZTNA 2.0, and why does Palo Alto say ZTNA 1.0 is broken?"
4. "What's the difference between a remote network and a service connection?"

### Knowledge checks (answers in files 02 and 03)
- [ ] Name the four App-ID classification techniques, in order.
- [ ] Name five User-ID mapping sources. Which ones fit Prisma Access mobile users?
- [ ] Which Content-ID profile types attach to a security rule?
- [ ] Why can't a service connection be used for internet egress?
- [ ] What does Cloud Identity Engine replace in a classic on-prem User-ID design?
- [ ] What does "allow and ignore" mean in the ZTNA 1.0 critique?

---

## SATURDAY, OCT 31: Deep technical architecture (about 7.5 h)

### Learning objectives
1. Trace five traffic flows end to end: MU→Internet, MU→SaaS, MU→private app (SC and ZTNA Connector), Branch→DC, MU→Branch.
2. Run a structured troubleshooting workflow for Scenario B.
3. Explain Prisma SD-WAN app-defined path selection and how it differs from Catalyst SD-WAN and Juniper SSR.
4. Explain the SCM vs. Panorama management choices and the logging architecture.
5. Know ADEM, SaaS Security/CASB, Enterprise DLP, and Prisma Access Browser well enough to place each in a design.
6. Defend design tradeoffs in Scenarios A and C.

### Schedule and priority
| Time | Priority | Topic | Material |
|---|---|---|---|
| 0:00–2:00 | P0 | Traffic flows and routing | `03-prisma-sase-architecture.md` §6–7; TechDocs → **Routing for Service Connections**, **Prisma Access Internal DNS / DNS Proxy**, **Hot Potato / Backbone Routing** ⚠️ |
| 2:00–3:30 | P0 | Scenario B troubleshooting | `04-scenarios.md` Scenario B |
| 3:30–3:45 | — | Break | |
| 3:45–5:15 | P1 | Prisma SD-WAN | `02-technology-mapping.md` §10; Prisma SD-WAN TechDocs → **Path Policy**, **App-Defined Fabric/VPN**, **Prisma Access Integration** |
| 5:15–6:00 | P1 | SCM, Panorama, Strata Logging Service | `02-technology-mapping.md` §13 |
| 6:00–6:45 | P2 | ADEM, CASB/SaaS Security, DLP, Browser | `02-technology-mapping.md` §8, §9, §14 |
| 6:45–8:15 | P0 | Scenarios A and C | `04-scenarios.md` |

### Architecture examples
- **Path selection example:** a branch ION with MPLS + broadband + LTE. The path policy sends Zoom/Teams over the best-performing broadband with LTE as fallback, puts SAP on MPLS, and sends guest Wi-Fi straight to the internet through Prisma Access. Performance policy is based on per-application metrics (latency, jitter, loss, and application response characteristics), not only link probes.
- **Private app example:** the same app is reached through the SC by legacy branch users and through the ZTNA Connector by remote users during a migration. Explain the routing conflict risk and how you'd sequence the cutover.

### Practical exercises
1. **Packet walk (30 min).** For MU → `jira.corp.local` via the SC, write each hop: DNS resolution (where and by whom), tunnel, SPN policy lookup, backbone, SC, BGP route, DC firewall, return path. Note every place this can fail.
2. **Failure injection (30 min).** For each hop in exercise 1, write the symptom a user would see and the first log or command you'd check (Prisma Access logs in SCM/Strata Logging Service, GlobalProtect logs, BGP status at the SC, DC firewall logs).
3. **Tradeoff table (20 min).** SC vs. ZTNA Connector across eight criteria: routing, overlapping IPs, inbound ports, scale, app types (server-initiated flows?), HA, operational ownership, and migration effort.
4. **SD-WAN translation (20 min).** Explain to a Catalyst SD-WAN engineer how an ION decides the path for the *first* packet of a new flow. ⚠️ Confirm the current wording in Prisma SD-WAN docs ("first-packet application identification" is how Palo Alto has described it historically).

### Interview questions for Saturday
1. "A user authenticates but can't reach a private app. Walk me through how you'd troubleshoot it."
2. "Service connection or ZTNA Connector: how do you decide?"
3. "How does Prisma SD-WAN differ from traditional SD-WAN?"
4. "How do you handle decryption for Microsoft 365 in Prisma Access?"
5. "Where does ADEM fit, and what problem does it solve that logs don't?"

### Knowledge checks
- [ ] Where is DNS resolved for a mobile user's internal domain, and how do you configure it?
- [ ] What happens to return traffic if the DC's BGP doesn't prefer the SC for the mobile user IP pool?
- [ ] Name two reasons a SaaS tenant restriction is better enforced inline than via API CASB.
- [ ] What does ADEM measure on each segment of the path?
- [ ] What's the difference between Prisma SD-WAN and PAN-OS SD-WAN (the NGFW plugin)?

---

## SUNDAY, NOV 1: Interview readiness (about 7 h)

### Learning objectives
1. Present a 90-day product launch readiness strategy (Scenario D) in under 5 minutes, then defend it.
2. Deliver five STAR stories in 2 minutes each, with metrics you've verified.
3. Answer the seven strategic and motivation questions crisply (60–90 seconds each).
4. Complete a scored mock interview and fix your two weakest categories.

### Schedule and priority
| Time | Priority | Topic | Material |
|---|---|---|---|
| 0:00–1:30 | P0 | Scenario D: launch readiness strategy | `04-scenarios.md` Scenario D |
| 1:30–3:30 | P0 | STAR stories: fill in placeholders, rehearse out loud, time yourself | `06-behavioral-and-strategy.md` §1 |
| 3:30–3:45 | — | Break | |
| 3:45–4:45 | P0 | Motivation and strategy answers | `06-behavioral-and-strategy.md` §2–3 |
| 4:45–6:45 | P0 | Mock interview (ask Claude to start mock interview mode) | `08-mock-interview-protocol.md` |
| 6:45–7:15 | P1 | Questions for the hiring manager; final review | `06` §4, `07` |

### Practical exercises
1. **Competency model (30 min).** Write a three-level proficiency model (Foundational / Practitioner / Expert) for "Prisma Access private app access." Give each level observable behaviors and an assessment method.
2. **Metrics ladder (15 min).** For Scenario D, write one metric at each Kirkpatrick-style level (reaction → learning → behavior → results) plus one leading field indicator (for example, POV success rate).
3. **Story audit (30 min).** For every number in your STAR stories, mark it ✅ (you can source it) or remove it.
4. **Record yourself (20 min).** Record your answer to "Why Palo Alto?" and remove filler and marketing phrasing.

### Interview questions for Sunday
- "Design a technical readiness program for a new SASE capability launching in 90 days."
- "How do you know enablement worked?"
- "Tell me about a time you influenced Product without authority."
- "How would you use AI in enablement without compromising technical accuracy?"

### Knowledge checks
- [ ] Can you state your readiness strategy as three phases with exit criteria?
- [ ] Can you name a metric that leadership cares about and that enablement plausibly influences?
- [ ] Does each STAR story end with a lesson *and* how you applied it later?

### Monday morning (30 min max)
Read `07-monday-revision-sheet.md`. Do not learn anything new.

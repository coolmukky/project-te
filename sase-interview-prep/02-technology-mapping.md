# Cisco / Juniper / Palo Alto Technology Mapping and Capability Deep Dives

**Equivalence types used below:**
- **Direct**: the same role in the architecture, broadly substitutable.
- **Functional peer**: solves the same customer problem with a different architecture.
- **Partial**: overlaps on some functions only. Don't present it as a substitute.
- **No clean equivalent**: the construct doesn't exist the same way.

⚠️ Competitor product names change often. Cisco renamed many products in 2023–2025, and HPE completed its acquisition of Juniper in 2025. Use the names below as of mid-2026 and check before quoting them.

---

## §1 Master mapping table

| Capability | Palo Alto | Cisco | Juniper | Equivalence and notes |
|---|---|---|---|---|
| Single-vendor SASE | **Prisma SASE** (Prisma Access + Prisma SD-WAN + SCM + ADEM) | Cisco Secure Access + Catalyst SD-WAN / Meraki SD-WAN ("Cisco SASE") | Juniper Secure Edge + SSR / Mist WAN Assurance | Functional peer. The degree of integration varies by vendor. |
| SSE platform | **Prisma Access** | **Cisco Secure Access** (successor to Umbrella SIG) | **Juniper Secure Edge** | Functional peer. Prisma Access runs full PAN-OS in its cloud nodes. |
| Remote access agent | **GlobalProtect**; **Prisma Access Agent** ⚠️ | **Cisco Secure Client** (formerly AnyConnect) | **Juniper Secure Connect** | Direct (agent role) |
| Agentless / browser access | **Prisma Access Browser** (from the Talon acquisition); Explicit Proxy; ⚠️ Clientless VPN (legacy) | Secure Access clientless ZTNA / browser-based ZTNA | Limited | Partial. Palo Alto's is a full enterprise browser, a different architecture from a reverse proxy. |
| NGFW | **PAN-OS NGFW** (PA-Series, VM-Series, CN-Series, Cloud NGFW) | **Cisco Secure Firewall** (FTD/ASA) | **SRX Series / vSRX / cSRX** | Direct |
| App identification | **App-ID** | NBAR2 / OpenAppID / AVC on Firepower | **AppSecure / AppID** on SRX | Direct in concept. In PAN-OS, App-ID is *the policy primitive*; elsewhere it's usually an add-on match criterion. |
| Identity to IP | **User-ID**, **Cloud Identity Engine** | ISE + pxGrid, Passive Identity Connector, Duo | JIMS, Integrated User Firewall, Mist Access Assurance | Direct (User-ID ≈ identity firewall). CIE ≈ cloud directory sync. |
| Threat inspection | **Content-ID**: Advanced Threat Prevention, AV, Anti-Spyware, Vuln Protection, File Blocking | Snort 3 IPS, Secure Malware Analytics/AMP, Talos | IDP, ATP Cloud, SecIntel | Direct |
| Sandbox | **Advanced WildFire** | Secure Malware Analytics (Threat Grid) | Juniper ATP Cloud | Direct |
| URL / web filtering | **Advanced URL Filtering** (inline ML) | Umbrella / Secure Access web filtering; Talos URL categories | Enhanced Web Filtering (Forcepoint/Juniper NextGen) | Direct |
| DNS security | **Advanced DNS Security** | **Umbrella DNS** (Cisco's historic strength) | SecIntel DNS sinkhole | Direct. Cisco Umbrella is the natural competitor here. |
| SWG | Prisma Access (MU/RN + Explicit Proxy) | Secure Access SWG | Secure Edge SWG | Direct |
| CASB (inline + API) | **SaaS Security** (Inline + API + SSPM), AI Access Security | Secure Access CASB, **Cloudlock** (API) | Secure Edge CASB | Functional peer |
| DLP | **Enterprise DLP** (shared across NGFW, Prisma Access, SaaS Security) | Secure Access / Umbrella DLP, Cloudlock DLP | Secure Edge DLP; ICAP to third parties on SRX | Functional peer |
| FWaaS | Prisma Access (L3–L7 NGFW on all ports and protocols) | Secure Access FWaaS (L3/L4 + L7 via Snort) ⚠️ | Secure Edge FWaaS | Functional peer. Palo Alto argues full NGFW parity. |
| ZTNA | **ZTNA 2.0** in Prisma Access + **ZTNA Connector** | Secure Access ZTNA + Resource Connector; "Universal ZTNA" with Duo device trust | Secure Edge ZTNA | Functional peer. Granularity and continuous inspection are the debate points. |
| DC / private-network on-ramp | **Service Connection** (IPsec + BGP) | Secure Access network tunnels (IPsec) to DC; SD-WAN integration | Secure Edge IPsec | Partial. Palo Alto's SC is a defined construct with BGP and specific routing roles. |
| SD-WAN | **Prisma SD-WAN** (ION, from CloudGenix) | **Catalyst SD-WAN** (Viptela), Meraki SD-WAN | **Session Smart Router** (128T), Mist WAN Assurance; Contrail SD-WAN (legacy) | Functional peer. Different philosophies: app-session (Palo Alto/SSR) vs. overlay/TLOC (Catalyst). |
| SD-WAN on firewall | **PAN-OS SD-WAN** (Panorama plugin) | Secure Firewall SD-WAN features; Catalyst SD-WAN on ISR/C8000 | SRX as SD-WAN CPE | Direct-ish. **Don't confuse it with Prisma SD-WAN.** |
| Cloud management | **Strata Cloud Manager** (SCM) | Security Cloud Control (formerly CDO), Catalyst SD-WAN Manager, Meraki dashboard | Security Director Cloud, Mist cloud | Functional peer |
| On-prem management | **Panorama** | FMC (Secure Firewall Management Center) | Junos Space Security Director | Direct |
| Logging data lake | **Strata Logging Service** (formerly Cortex Data Lake) | Security Cloud / XDR data, Secure Access reporting | Security Director Cloud logs, Mist | Partial |
| Digital experience | **ADEM** | **ThousandEyes** (endpoint, enterprise, cloud agents) | Mist **Marvis** + WAN Assurance (wired/wireless/WAN SLEs) | Partial. ThousandEyes is broader. Marvis is network-AIOps-centric. |
| NAC / segmentation | Device-ID / IoT Security; Dynamic User Groups / Dynamic Address Groups | **ISE** + TrustSec/SGT | Mist Access Assurance, Group-Based Policy (GBP) on EX | Partial. Palo Alto isn't a NAC vendor; it **consumes** NAC context. |

---

## §2 SASE vs. SSE

1. **Problem.** The perimeter moved to users, SaaS, and branches. Hairpinning traffic to a DC security stack adds latency, cost (MPLS), and blind spots.
2. **How it works.** SSE pushes SWG, CASB, ZTNA, FWaaS, and DLP into a globally distributed cloud. SASE adds the WAN edge (SD-WAN), so the branch connects to the nearest PoP and gets consistent security.
3. **Palo Alto implementation.** ✅ Prisma Access = SSE. ✅ Prisma SASE = Prisma Access + Prisma SD-WAN, with SCM and ADEM. Palo Alto markets "single-vendor SASE."
4. **Cisco / Juniper.** Cisco: Secure Access (SSE) + Catalyst/Meraki SD-WAN. Juniper: Secure Edge (SSE) + SSR/Mist.
5. **Tradeoffs.** Single-vendor gives one policy and data model and simpler operations, but you're locked in and depend on that vendor's weakest component. Dual-vendor (best-of-breed SD-WAN + SSE) means more integration work (tunnels, identity, telemetry correlation), with more choice in return.
6. **Example.** A retailer with 300 stores replaces MPLS + DC proxies with ION devices at the stores (broadband + LTE). Stores connect to Prisma Access remote networks and the DC connects via service connections.
7. **Interview Q:** "A customer asks whether they need SASE or just SSE." **Strong answer:** "It depends on whether the WAN is part of the problem. If the pain is remote users and SaaS security, SSE solves it and they can keep their SD-WAN, with Prisma Access taking IPsec from any vendor's CPE. If they're also refreshing branch routers, fighting MPLS cost, or can't see application performance, SASE lets them converge. Then the questions are operational: one policy model, one identity source, one telemetry plane. I'd qualify it by WAN refresh timing, operations team structure, and how much they value integrated troubleshooting, for example ADEM across both SD-WAN and Prisma Access."

---

## §3 Prisma SASE (the portfolio)

1. **Problem.** Fragmented point products with separate policies, logs, and agents.
2. **How it works.** It's a converged platform. The security data plane is Prisma Access, the WAN edge is Prisma SD-WAN, management and AIOps run in Strata Cloud Manager, identity comes from Cloud Identity Engine, logs go to Strata Logging Service, and experience is monitored by ADEM. Add-ons include SaaS Security, Enterprise DLP, Prisma Access Browser, AI Access Security, and IoT Security. ⚠️ Licensing bundles change, so don't quote SKUs.
3. **Palo Alto implementation.** See file 03.
4. **Cisco / Juniper.** As in §2.
5. **Differentiators Palo Alto claims** (🔶 present them as claims, not facts): full NGFW inspection on all ports and protocols in the cloud (rather than just HTTP/S proxy), ZTNA 2.0, App-ID consistency from data center to cloud, AI-powered operations (ADEM, AIOps), and a shared threat intelligence pipeline (WildFire, Unit 42).
6. **Example.** The full design in Scenario A.
7. **Interview Q:** "Explain Prisma SASE in two minutes to a new SE." **Answer framework:** problem → three onboarding paths (users, sites, DCs/apps) → one policy engine (PAN-OS) → one management and telemetry plane → one sentence on what's different from a proxy-based SSE → one customer example.

---

## §4 Prisma Access

1. **Problem.** It delivers consistent NGFW-grade security to users and branches everywhere, without backhaul.
2. **How it works.** Palo Alto runs Security Processing Nodes (SPNs: PAN-OS instances) across public cloud infrastructure (⚠️ Google Cloud and AWS). Users and sites connect to the nearest **Prisma Access location**. Each location is served by a **compute location**, the region where the SPNs actually run, so many locations can map to one compute location. That mapping drives latency and egress IP geography. Traffic between Prisma Access nodes rides the cloud provider's backbone.
3. **Palo Alto implementation.** ✅
   - **Mobile Users**: GlobalProtect (gateways/portal hosted by Prisma Access), **Explicit Proxy** (PAC file), Prisma Access Agent ⚠️.
   - **Remote Networks**: IPsec from branch CPE, static or BGP, with bandwidth allocated per compute location ⚠️ licensing model.
   - **Service Connections**: IPsec + BGP to DC/HQ/cloud VPCs. They provide access to private apps and connect the mobile user and remote network domains to on-prem resources.
   - **ZTNA Connector**: outbound, app-based connector for private apps.
   - **Infrastructure subnet**: an RFC 1918 block you supply for Prisma Access internal routing. It must not overlap your network.
   - **Internal DNS**: you define internal domains and DNS servers so Prisma Access resolves internal names for remote users.
   - **Egress**: public egress IPs per location. Dedicated egress IPs and **Traffic Steering** can forward specific traffic out via a service connection or a dedicated IP.
   - **Management**: Panorama-managed or cloud-managed (SCM). ⚠️ New capabilities increasingly land first, or only, in cloud-managed.
   - **Colo-Connect** ⚠️ for high-bandwidth, VLAN-based connections in colocation facilities.
4. **Cisco / Juniper.** Cisco Secure Access (functional peer). Juniper Secure Edge (functional peer).
5. **Tradeoffs.** Full PAN-OS in the cloud gives you App-ID and Threat Prevention on all ports and protocols, policy parity with on-prem NGFW, and less retraining for firewall teams. The consequences: firewall-style operations (zones, rules, NAT concepts) feel heavier to pure proxy/web teams; capacity is planned per location and compute region; and Panorama vs. cloud-managed is a real decision.
6. **Example.** 500 remote users across North America and EMEA → GlobalProtect into four Prisma Access locations; two DCs on service connections with eBGP; branches as remote networks.
7. **Interview Q:** "What's the difference between a service connection and a remote network?" **Answer:** "Both are IPsec into Prisma Access. A **remote network** onboards a *site's users* so their traffic is secured and can egress to the internet. A **service connection** onboards *resources*: it gives Prisma Access routes to DC or cloud apps and a return path, and it isn't a general internet-egress path. RNs get security policy applied as a source. SCs are effectively transit to private apps, and their BGP behavior determines whether mobile users can reach on-prem resources at all."

---

## §5 NGFW core: App-ID, User-ID, Content-ID

### §5.1 App-ID
1. **Problem.** Ports no longer identify applications. Everything runs on 443, and evasive apps hop ports.
2. **How it works.** ✅ Classification runs as a pipeline. It starts with **IP/port** to pick initial decoders, then applies **application signatures**. If decryption policy matches, it **decrypts** (TLS) and inspects inside. **Application protocol decoders** find apps tunneled inside other protocols. **Heuristics** catch evasive apps (for example, P2P). Identification is continuous, so the app can *shift* mid-session (`ssl` → `web-browsing` → `facebook-base`) and policy is re-evaluated when it does. Special values you should know: `unknown-tcp/udp`, `incomplete` (no complete handshake), `insufficient-data`, `not-applicable`. Apps have **implicit dependencies** (some declared automatically, some you must allow).
3. **Palo Alto implementation.** Security rules match on `application`. The `service` field should be `application-default`, so the app is only allowed on its standard ports. **Policy Optimizer** converts legacy port-based rules into App-ID rules based on observed traffic. **Application override** forces an app identity and *disables L7 inspection* for that traffic, so use it rarely. You can write **custom apps** for in-house protocols. **App-ID Cloud Engine (ACE)** ⚠️ provides cloud-delivered, granular SaaS App-IDs.
4. **Cisco / Juniper.** Cisco NBAR2/AVC/OpenAppID on Secure Firewall. Juniper AppSecure (AppID, AppFW, AppQoS) on SRX. Both are direct in concept.
5. **Differences.** In PAN-OS, App-ID is the *first-class* policy key, and every session gets an application. On SRX and FTD, app ID historically arrived as an extra match field on 5-tuple policy. The operational difference is the *migration to App-ID*. Palo Alto's best practice is "no port-based allow rules," and that's what drives Policy Optimizer projects.
6. **Example.** Allow `ms-rdp` only to `Jump-Hosts` for `IT-Admins`, with `application-default`. Block `ms-rdp` everywhere else, whatever the port.
7. **Interview Q:** "How does App-ID handle encrypted traffic?" **Answer:** "Before decryption it can still identify a lot from the handshake, such as SNI and certificate details, which gives `ssl` or a specific SaaS app. To see the actual application, and to run Content-ID, you need a decryption policy, usually SSL Forward Proxy outbound and Inbound Inspection for your own servers. With TLS 1.3 and ECH reducing what's visible, decryption is what makes App-ID and threat inspection effective, so a realistic decryption policy with privacy and pinning exclusions is part of the design, not an optional extra."

### §5.2 User-ID
1. **Problem.** IP addresses don't identify people, and policy and visibility should be identity-based.
2. **How it works.** ✅ It builds **IP-to-user mappings** and **user-to-group mappings**. Mapping sources include server monitoring of AD security event logs (the Windows User-ID agent or the agentless PAN-OS integrated agent), **GlobalProtect** (authoritative for its users), **Authentication Portal** (captive portal), the **Terminal Server Agent** (port-range mapping for multi-user hosts), **syslog parsing** (from NAC such as Cisco ISE or ClearPass, proxies, or WLCs), the **XML API**, and XFF headers. Group mapping comes from LDAP or the **Cloud Identity Engine**. **User-ID redistribution** shares mappings across firewalls.
3. **Palo Alto implementation.** Policy matches on `source-user` (groups). **Dynamic User Groups** let automation, such as a SOAR tagging a user as compromised, change policy without a commit. In Prisma Access, GlobalProtect/agent login provides the mapping and CIE provides groups. Branch users behind remote networks still need a mapping source, such as on-prem User-ID redistributed to Prisma Access ⚠️ (verify the current mechanism).
4. **Cisco / Juniper.** Cisco ISE + pxGrid (session directory) and Passive Identity Connector. Juniper JIMS + Integrated User Firewall. Both are direct.
5. **Differences.** ISE *is* the authentication and authorization authority (802.1X, TrustSec). User-ID is a *consumer* that maps identities for enforcement. In a Cisco + Palo Alto shop, ISE often feeds User-ID via syslog or pxGrid-based integrations ⚠️. That's a strong talking point given your ISE background.
6. **Example.** ISE authenticates a campus user over 802.1X and sends the session to the NGFW. The rule `Finance-Users → sap-*` permits with threat profiles.
7. **Interview Q:** "What breaks User-ID?" **Answer:** "Stale or overlapping mappings (DHCP churn, multi-user hosts without the TS agent), missing group mapping (LDAP or CIE sync scope), timeouts that are too short or too long, NAT hiding the real source IP, and mappings that never get redistributed to the enforcement point. In SASE, the common gap is branch users behind remote networks, where nothing populates mappings in Prisma Access."

### §5.3 Content-ID
1. **Problem.** Allowed traffic still carries threats and data.
2. **How it works.** ✅ It's stream-based inspection in a **single pass** (Palo Alto's Single-Pass Parallel Processing architecture). Security **profiles** attach to *allow* rules: Antivirus, Anti-Spyware (including DNS signatures and DNS Security), Vulnerability Protection, URL Filtering, File Blocking, WildFire Analysis, and Data Filtering. The **Advanced** subscriptions (Advanced Threat Prevention, Advanced URL Filtering, Advanced WildFire) add inline ML / deep learning for unknown C2, zero-day exploits, and phishing.
3. **Palo Alto implementation.** You build **Security Profile Groups** (for example, `best-practice`) and set them as the default group on allow rules. Prisma Access applies the same profiles.
4. **Cisco / Juniper.** Snort 3 IPS + AMP + URL on FTD. IDP + ATP Cloud + SecIntel on SRX. Direct.
5. **Differences.** The single-pass architecture is Palo Alto's performance argument. The real engineering constraint everywhere is decryption coverage.
6. **Example.** An allow rule for `web-browsing, ssl` from `Users` to `Internet` with profile group `strict`. The DNS Security sinkhole catches a C2 lookup and the alert correlates with the user via User-ID.
7. **Interview Q:** "Why attach profiles only to allow rules?" **Answer:** "Deny rules drop traffic, so there's nothing to inspect. The risk lives in what you allow, and every allow rule should carry a profile group. Best practice is a default group so new rules don't ship uninspected."

---

## §6 Policy model, decryption, FWaaS, and SWG

**Policy model essentials (✅):**
- Security rules match on zone → zone, source/destination address, **user**, **application**, **service**, and **URL category** (for web), and are evaluated top-down.
- Defaults: intrazone traffic is allowed, interzone traffic is denied. Override the defaults so you get logging.
- NAT policy is evaluated *before* security policy. Security rules use **pre-NAT IPs** and **post-NAT zones**. This trips up SRX engineers.
- Decryption policy types: **SSL Forward Proxy** (outbound), **SSL Inbound Inspection** (your servers), **SSH Proxy**. Don't decrypt certificate-pinned apps, privacy categories (health, finance), or anything you're legally barred from inspecting.

### FWaaS
1. **Problem.** Branch and remote traffic needs full firewalling, not just web proxying.
2. **How it works.** Cloud-delivered L3–L7 firewall for all ports and protocols.
3. **Palo Alto.** It's inherent to Prisma Access, because SPNs are NGFWs. RN and MU traffic hits the full PAN-OS policy.
4. **Cisco / Juniper.** Secure Access FWaaS. Secure Edge FWaaS. Functional peers.
5. **Tradeoff.** Full-protocol inspection in the cloud matters for non-web apps (SSH, RDP, SMB, VoIP). Proxy-based SSEs are strongest on HTTP/S.
6. **Example.** Branch IoT devices limited to `modbus` and `bacnet` toward the DC, inspected in Prisma Access.
7. **Interview Q:** "Is SWG enough for branches?" **Answer:** "Usually not. A large share of branch traffic isn't web, including voice, OT protocols, admin protocols, and printing. FWaaS with App-ID covers all of it. SWG alone forces you to keep a branch firewall, which undercuts the consolidation case."

### SWG
1. **Problem.** Secure web and SaaS access with URL, threat, and data controls.
2. **How it works.** Inline inspection of HTTP/S with URL categorization, malware and phishing prevention, and DLP.
3. **Palo Alto.** Prisma Access with Advanced URL Filtering and Threat Prevention. **Explicit Proxy** mode (PAC file, SAML/Kerberos auth) suits customers migrating from on-prem proxies (Zscaler, Blue Coat) who want proxy semantics or can't deploy an agent.
4. **Cisco / Juniper.** Cisco Secure Access SWG (Umbrella heritage) and Juniper Secure Edge are functional peers.
5. **Tradeoff.** Tunnel mode (GlobalProtect) captures all traffic. Explicit proxy covers only proxy-aware web traffic, but migration is simpler.
6. **Example.** A bank migrates 30k users off an on-prem proxy to Prisma Access explicit proxy first, then moves to the agent.
7. **Interview Q:** "Explicit proxy or tunnel?" **Answer:** Coverage vs. migration friction. Explicit proxy for a fast proxy replacement and agentless cases, tunnel for full traffic coverage, ZTNA, and HIP posture. Often both, in phases.

---

## §7 GlobalProtect and Prisma Access Agent

1. **Problem.** Steer endpoint traffic to security, assert identity, and supply device posture.
2. **How it works.** ✅ GlobalProtect has a **portal** (configuration and gateway list) and **gateways** (tunnel termination). It authenticates with SAML, LDAP, certificates, or MFA, selects the best gateway, and builds IPsec (with SSL fallback). The **HIP (Host Information Profile)** collects posture (OS patch level, disk encryption, EDR running) and is used in policy as HIP objects and profiles. Modes include **always-on** (pre-logon, user-logon), on-demand, split tunnel (by domain/app/IP), and internal host detection.
3. **Palo Alto implementation.** In Prisma Access, portal and gateways are hosted in the cloud. ⚠️ The **Prisma Access Agent** is a newer agent purpose-built for Prisma Access and managed from Strata Cloud Manager. GlobalProtect remains for NGFW-terminated remote access and existing deployments. **Check the current feature parity and the recommended agent for new Prisma Access deployments before the interview.** It's a likely "do you keep up?" question.
4. **Cisco / Juniper.** Cisco Secure Client (VPN, ZTNA module, Umbrella roaming, posture via ISE/Duo). Juniper Secure Connect. Direct.
5. **Tradeoffs.** Split tunneling improves performance (for example, for Teams media) but reduces visibility. HIP checks at connect time vs. periodic re-evaluation is the ZTNA 2.0 continuous-trust point.
6. **Example.** Always-on, pre-logon GlobalProtect with certificate-based machine authentication, then SAML user authentication via Entra ID. HIP requires Cortex XDR running and disk encryption to access Finance apps.
7. **Interview Q:** "How would you enforce device posture for private app access?" **Answer:** "Define HIP objects (EDR running, OS version, disk encryption), group them into HIP profiles, and reference them as a match criterion in the rules for sensitive apps. Make the deny actionable, using HIP notification messages to tell the user what to fix. Re-evaluate posture during the session, so a device that falls out of compliance loses access mid-session. That's the practical meaning of continuous trust verification."

---

## §8 CASB / SaaS Security

1. **Problem.** Shadow IT, risky SaaS activity, data exposure in sanctioned SaaS, and SaaS misconfiguration.
2. **How it works.** **Inline** CASB sees traffic in flight: discovery, risk scoring, and activity control (upload/download/post). **API** CASB connects to SaaS APIs out of band to scan data at rest, sharing, and malware. **SSPM** checks SaaS configuration posture.
3. **Palo Alto.** ✅ **SaaS Security** has Inline (App-ID, ACE, SaaS risk catalog), **API** (formerly Aperture), and **SSPM**. **AI Access Security** ⚠️ covers GenAI app visibility and control. **Tenant restrictions** use header insertion (for example, Microsoft 365 tenant restriction headers) to block personal tenants.
4. **Cisco / Juniper.** Cisco: Secure Access CASB, Cloudlock (API), App Discovery. Juniper: Secure Edge CASB. Functional peers.
5. **Tradeoffs.** Inline is real-time but needs decryption and traffic steering. API is complete for sanctioned apps (it sees data uploaded from unmanaged devices too) but acts after the fact. Use both.
6. **Example.** Block uploads to personal Google Drive. Allow corporate Drive, with DLP inline and API scanning for publicly shared files.
7. **Interview Q:** "Inline or API CASB?" **Answer:** Both, for different jobs. Inline prevents in real time on managed traffic. API covers data at rest and unmanaged-device activity in sanctioned apps. SSPM handles misconfiguration.

---

## §9 DLP (Enterprise DLP)

1. **Problem.** Sensitive data leaving through web, SaaS, email, or GenAI.
2. **How it works.** Content inspection with **data patterns**: predefined (PII, PCI), regex, **Exact Data Matching (EDM)**, document fingerprinting, **ML-based classifiers**, and OCR for images. These combine into **data profiles** that are referenced in policy.
3. **Palo Alto.** ✅ **Enterprise DLP** is a cloud service, so one detection engine and one set of profiles apply across NGFW, Prisma Access, and SaaS Security (inline and API). ⚠️ Email DLP, endpoint DLP, and the "Data Security" packaging change, so verify.
4. **Cisco / Juniper.** Cisco Secure Access DLP, Cloudlock DLP. Juniper Secure Edge DLP; SRX uses ICAP to third-party DLP. Functional peer or partial.
5. **Tradeoffs.** Consistency across channels vs. false-positive tuning effort. Inline DLP requires decryption.
6. **Example.** EDM of a customer database hash blocks exact-record exfiltration to unsanctioned SaaS and alerts on uploads to the sanctioned app.
7. **Interview Q:** "How do you reduce DLP false positives?" **Answer:** Start in alert-only mode, use EDM or fingerprinting for high-value data rather than regex, tune confidence and occurrence thresholds, and scope by app, user, and activity.

---

## §10 Prisma SD-WAN (ION) and application-aware path selection

1. **Problem.** Expensive MPLS, poor SaaS performance, and box-by-box router operations.
2. **How it works.** ✅ **App-defined SD-WAN** (CloudGenix heritage). **ION** devices identify applications at the *session* level, including on the first packet for known apps (⚠️ verify the current wording), and measure **per-application** performance (latency, jitter, loss, and app response and transaction metrics) on every path. **Path policies** pick active, backup, and L3 failure paths per app. **Performance policies** set thresholds that trigger path changes. **QoS**, **NAT**, and **zone-based firewall** policies are also included. Sites build a **secure fabric** (VPN mesh, auto-created) and run BGP/OSPF toward LAN and DC.
3. **Palo Alto implementation.** Cloud-managed (now in SCM ⚠️; the legacy Prisma SD-WAN portal persists). **Native Prisma Access integration** auto-provisions IPsec tunnels from ION to Prisma Access remote networks. **CloudBlades** offer API-based integrations ⚠️. **Remote Site ADEM** runs from the ION. A range of ION models covers small branches through DC/hub, plus virtual IONs ⚠️ (check current models).
4. **Cisco / Juniper.**
   - **Catalyst SD-WAN**: overlay-centric. OMP control plane, TLOCs, controller-pushed policy. **App-aware routing** relies on **BFD probes per tunnel** checked against SLA classes. Apps are identified by NBAR2/DPI. Cloud OnRamp for SaaS probes SaaS paths.
   - **Juniper SSR (128T)**: session-centric and **tunnel-free** (secure vector routing, with metadata on the first packet), using service-based policy. Mist WAN Assurance + Marvis for operations.
   **Mapping verdict:** functional peer to both. Prisma SD-WAN is philosophically closer to SSR (application- and session-first) than to Catalyst (tunnel- and SLA-class-first), but it still uses IPsec overlays.
5. **Tradeoffs.**
   - Per-app measurement vs. per-tunnel probes: per-app can detect app degradation even when the link probes look healthy. The cost is more complex analytics, and it relies on the vendor's classification.
   - Prisma SD-WAN vs. **PAN-OS SD-WAN** (on NGFW, Panorama plugin): Prisma SD-WAN is the strategic SASE edge. PAN-OS SD-WAN suits customers who want one box (an NGFW at the branch) with simpler SD-WAN needs. 🔶 Expect to be asked to tell them apart.
   - ION's built-in zone-based firewall vs. full NGFW at the branch: with Prisma Access doing the inspection, the branch can stay lean.
6. **Example.** Branch with MPLS + broadband + LTE. Voice and video go to the best broadband path with SLA failover. SAP goes on MPLS. Internet and SaaS go to Prisma Access via auto-tunnels. Guest Wi-Fi uses a separate VRF/zone to Prisma Access.
7. **Interview Q:** "How does Prisma SD-WAN select a path differently from a probe-based SD-WAN?" **Answer:** "Probe-based SD-WAN measures the tunnel with synthetic probes and maps apps to SLA classes, so it knows the *path* is healthy, not that the *app* is. Prisma SD-WAN identifies the application per session and measures that application's actual performance on each path, then applies path policy per app with performance thresholds. You can catch problems like a SaaS app degrading on one ISP while ICMP probes look clean. The tradeoff is that you depend on accurate app identification, and you need to understand how the controller learns apps for first-packet decisions."

---

## §11 Service connections and ZTNA Connector

| Criterion | Service Connection | ZTNA Connector |
|---|---|---|
| Transport | IPsec from DC firewall/router to Prisma Access | Connector VM builds outbound tunnels to Prisma Access |
| Routing | **BGP** (or static). DC learns MU pools and RN subnets, and Prisma Access learns DC prefixes. | No route exchange. Apps are defined by FQDN, wildcard, or IP subnet. |
| Inbound exposure | Needs an IPsec peer on the DC edge | No inbound ports |
| Overlapping IPs | Problematic | Tolerated (connector NATs ⚠️) |
| Access granularity | Network-level reach. Policy still restricts by App-ID and user. | App-level targets by design |
| Server-initiated flows (for example, callbacks, SCCM push) | Supported (routed) | ⚠️ Typically not supported or limited, so verify |
| Branch ↔ DC transit and MU ↔ RN | Yes (SC is part of the Prisma Access routing domain) | Not a transit construct |
| Best fit | Full DC on-ramp, hybrid routing, legacy apps | Cloud VPCs and VNets, M&A, contractors, many small app enclaves, "no routing change" mandates |

1. **Problem.** Remote users and branches need private app access without exposing the apps or flattening the network.
2. **How it works.** See the table.
3. **Palo Alto implementation.** ✅ Connectors are deployed in **connector groups** for HA and scale, on VMware, AWS, Azure, GCP, and other platforms ⚠️. The rules that grant access reference the app targets.
4. **Cisco / Juniper.** SC ≈ Cisco Secure Access network tunnel to the DC (partial). ZTNA Connector ≈ **Cisco Secure Access Resource Connector** (close equivalent). Juniper Secure Edge relies on IPsec on-ramps (partial).
5. **Tradeoffs.** As in the table. Many enterprises use both: an SC for the core DC and connectors for cloud and app enclaves.
6. **Example.** An acquired company with overlapping 10.x space. ZTNA Connectors give users access to its apps without any routing integration.
7. **Interview Q:** "When must you still use a service connection?" **Answer:** "When the DC needs to reach users (server-initiated traffic), when branches on remote networks need DC reachability through Prisma Access, when you need dynamic routing with the DC, or when apps are too numerous or dynamic to list as connector targets."

---

## §12 ZTNA and ZTNA 2.0

1. **Problem.** VPNs grant network-level access. ZTNA 1.0 improved on that but still grants broad, IP/port-level access and trusts the session once it's allowed.
2. **How it works.** ✅ Palo Alto's five ZTNA 2.0 principles:
   1. **Least-privileged access**: identify the app at Layer 7 (App-ID), independent of IP and port, down to app functions where supported.
   2. **Continuous trust verification**: after access is granted, re-evaluate device posture and user and app behavior, and revoke access if they change.
   3. **Continuous security inspection**: inspect *all* allowed traffic for threats, including private app traffic.
   4. **Protect all data**: apply DLP consistently across private apps, SaaS, and the web.
   5. **Secure all apps**: cloud-native, legacy, SaaS, and apps with dynamic ports or server-initiated connections.
3. **Palo Alto implementation.** Prisma Access security rules with App-ID + User-ID/CIE groups + HIP profiles; Content-ID profiles on private app rules; Enterprise DLP; ZTNA Connector or service connection to the apps; Prisma Access Browser for unmanaged devices.
4. **Cisco / Juniper.** Cisco Secure Access ZTNA + Duo device trust ("Universal ZTNA" messaging, continuous posture ⚠️). Juniper Secure Edge ZTNA. Functional peers. The difference shows up in L7 granularity and in inspecting allowed private app traffic.
5. **Tradeoffs.** Deep inspection of private app traffic costs capacity and requires decryption, and the policies need curation. Overly granular app policies are also harder to operate. 🔶 Be honest about this. "ZTNA 2.0" is partly marketing framing of capabilities a well-built NGFW policy already has.
6. **Example.** Contractors get `jira` and `confluence` access only (App-ID). It's revoked if EDR stops (HIP re-check), threat-inspected, and DLP prevents bulk export.
7. **Interview Q:** "What's actually technically different in ZTNA 2.0?" **Answer:** "Three things I can point to in configuration: App-ID-based rules rather than IP/port grants, HIP posture re-evaluated during the session rather than once at connect, and Content-ID and DLP profiles applied to the private app traffic itself. A ZTNA 1.0 broker that grants a tunnel to 10.1.1.10:443 and then steps out of the path can't stop a compromised but authorized user from exploiting that server. I'd also tell SEs to avoid overclaiming. Several competitors now offer posture re-checks, so the durable differentiator is inline L7 inspection on all ports and protocols."

---

## §13 Strata Cloud Manager (SCM)

1. **Problem.** Separate consoles for firewalls, SSE, and SD-WAN, and reactive operations.
2. **How it works.** Cloud management with **folders** (a hierarchy for inheritance), **snippets** (reusable config blocks), unified policy across NGFW and Prisma Access, the **Command Center** (health, threats, and data at a glance), **AIOps** (best practice assessments, predictive capacity and health alerts), **Policy Analyzer** (find shadowed or redundant rules before you commit), and a GenAI assistant (⚠️ "Strata Copilot", so verify the current name). Logs go to **Strata Logging Service**.
3. **Palo Alto implementation.** ✅ It manages Prisma Access (cloud-managed), Prisma SD-WAN, and NGFWs. It also provides visibility and AIOps for **Panorama-managed** estates. ⚠️ Check tiers (Essentials vs. Pro) and which NGFW features can be fully managed in SCM vs. Panorama.
4. **Cisco / Juniper.** Cisco Security Cloud Control (formerly CDO), FMC (on-prem), SD-WAN Manager. Juniper Security Director Cloud, Mist cloud. Functional peers. Panorama ↔ FMC / Security Director are direct peers.
5. **Tradeoffs.** Cloud-managed gives faster feature velocity and AIOps, but some customers have regulatory, air-gap, or operational habits that keep them on Panorama. Migrating Panorama-managed Prisma Access to cloud-managed is a real project.
6. **Example.** A global retailer: NGFWs in DCs still on Panorama, Prisma Access and SD-WAN in SCM, AIOps across all.
7. **Interview Q:** "Panorama or SCM for a new Prisma Access deployment?" **Answer:** "For a greenfield deployment, default to cloud-managed SCM. New features land there and it unifies SD-WAN and SSE. Choose Panorama when the customer already runs a large Panorama estate with mature templates and device groups and wants Prisma Access in the same operational model, or when there are specific feature or compliance constraints. Then plan the convergence path. I'd check the current feature-parity notes before committing in a design."

---

## §14 ADEM (Autonomous Digital Experience Management)

1. **Problem.** "The app is slow." Is it the device, Wi-Fi, ISP, SASE PoP, or the app? Security logs can't answer that.
2. **How it works.** ✅ An endpoint agent (inside GlobalProtect / Prisma Access Agent) runs **synthetic tests** (HTTP availability and timing, network path trace) to configured apps. It segments results across **device → Wi-Fi/LAN → ISP/internet → Prisma Access → application**, along with device health (CPU, memory, Wi-Fi signal). **Remote Site ADEM** runs from ION devices. AI-based correlation produces experience scores and root-cause hints, and ⚠️ some versions add real-user monitoring through a browser extension and end-user self-remediation notifications.
3. **Palo Alto.** Licensed add-on to Prisma Access / Prisma SD-WAN, viewed in SCM.
4. **Cisco / Juniper.** **ThousandEyes** (endpoint, enterprise, and cloud agents; also integrated into Cisco Secure Client and Catalyst SD-WAN) is partial to broader. **Mist Marvis / SLEs** cover network-side experience (partial).
5. **Tradeoffs.** ADEM is SASE-native and segment-aware for Prisma Access paths. ThousandEyes has broader internet and BGP visibility, independent of the SASE vendor.
6. **Example.** Teams calls are poor for 40 users. ADEM shows all of them on the same ISP in one city, with Prisma Access and Microsoft segments clean. The helpdesk escalates to the ISP, not to the security team.
7. **Interview Q:** "How does ADEM change the support model?" **Answer:** "It turns the SASE PoP from a black box into a measured segment. That cuts mean time to innocence for the security team and lets L1 support triage, which matters because moving security to the cloud otherwise shifts every 'slow app' ticket onto the network and security teams."

---

## §15 Prisma Access Browser (bonus, likely asked)

- ✅ It's an enterprise browser (from the **Talon** acquisition) that extends Prisma Access policy to unmanaged and BYOD devices, with controls such as copy/paste, download, print, screenshot, and watermarking, plus browser-level DLP and identity integration.
- **Cisco / Juniper:** no direct equivalent (Cisco has clientless browser-based ZTNA, which is a reverse-proxy model). Peers are Island and Google Chrome Enterprise Premium.
- **Use case:** contractors and M&A users on unmanaged laptops, without VDI.
- **Interview angle:** "VDI vs. enterprise browser vs. agent." Weigh cost, user experience, data control, and app coverage. A browser can't cover thick-client apps.

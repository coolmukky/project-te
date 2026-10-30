# Prisma SASE Architecture Walkthrough

Legend: ✅ confirmed · ⚠️ verify the current release · 🔶 coaching opinion

---

## §1 The four planes

| Plane | Component | What it does |
|---|---|---|
| **Data / security plane** | Prisma Access SPNs (MU-SPN, RN-SPN), service connection nodes, ZTNA Connector | Terminates tunnels and enforces PAN-OS security (App-ID, User-ID, Content-ID, URL, DNS, DLP, decryption) |
| **WAN edge plane** | Prisma SD-WAN ION | App-aware path selection, branch routing, auto-tunnels to Prisma Access |
| **Identity plane** | Cloud Identity Engine (directory sync + cloud authentication); IdP (Entra ID, Okta, Ping); GlobalProtect / Agent; HIP | Who the user is, which groups they're in, and device posture |
| **Management and telemetry plane** | Strata Cloud Manager (or Panorama + Cloud Services plugin), Strata Logging Service, ADEM, AIOps | Configuration, logs, analytics, experience |

🔶 **Whiteboard tip:** draw the planes in that order. Interviewers notice when candidates separate data, identity, and management, because operational problems usually come from the seams between those planes.

---

## §2 Locations, compute, and capacity

- ✅ **Prisma Access locations** are where users and sites connect. There are 100+ locations worldwide ⚠️ (the exact count changes).
- ✅ **Compute locations** are the cloud regions where the processing nodes actually run. Several Prisma Access locations can map to one compute location.
- **Why it matters:**
  - **Egress IP and geolocation**: SaaS apps see the egress IP of the location. Palo Alto uses localized egress IPs so content localizes correctly. Customers often need **egress IP allow-listing** on SaaS (for example, Salesforce IP restrictions). Prisma Access publishes egress IPs via API, and customers can request dedicated IPs ⚠️.
  - **Latency**: the user → location → compute region distance.
  - **Capacity**: remote network bandwidth is allocated per compute location ⚠️ (check the current licensing model). Mobile users are licensed per user.

---

## §3 Onboarding: Mobile Users

**GlobalProtect tunnel mode (✅):**
1. The agent contacts the **portal** (hosted in Prisma Access) and authenticates (SAML to the IdP via CIE, or other methods).
2. The portal returns the agent configuration and the gateway list. The agent chooses the best **gateway** (MU location) by response time and priority.
3. The agent builds an IPsec tunnel (SSL fallback) and gets an IP from the **mobile user IP pool** (per theater/region, RFC 1918, non-overlapping).
4. The **HIP report** is submitted, and the IP-to-user mapping is created and redistributed to the nodes that need it.
5. Split tunnel rules decide what goes into the tunnel. The ZTNA 2.0 stance is to tunnel everything except explicit exclusions, such as Teams/Zoom media optimization.

**Explicit Proxy (✅):** The browser uses a PAC file that points at the Prisma Access proxy FQDN. Authentication is SAML (via CIE) or Kerberos ⚠️. It covers web traffic only.

**Prisma Access Agent (⚠️):** a newer agent managed from SCM. Verify its current status and the migration guidance.

**Prisma Access Browser (✅):** unmanaged devices. Policy is enforced in the browser, with traffic steered through Prisma Access.

---

## §4 Onboarding: Remote Networks

1. The branch device (ION, NGFW, or third-party router) builds IPsec to the RN location. ION uses **native integration** to auto-provision the tunnels.
2. **Routing** is static or BGP. Prisma Access learns branch subnets.
3. Primary and secondary tunnels, often to different ISP circuits, provide HA. ⚠️ ECMP and load sharing options vary.
4. The RN-SPN enforces security on branch traffic. Internet traffic egresses at the location. DC traffic goes via the backbone to a service connection (or connector).
5. **User-ID for branch users** isn't automatic, because there's no agent. You redistribute mappings from on-prem User-ID sources or use CIE-based mechanisms ⚠️.

---

## §5 Onboarding: Service Connections and ZTNA Connector

**Service Connection (✅):**
- IPsec + **BGP** between a DC edge (firewall or router) and Prisma Access.
- Prisma Access advertises the **mobile user IP pools and remote network subnets** to the DC. The DC advertises its **app prefixes**.
- **Return path is the most common failure.** If the DC routes the MU pool somewhere else (for example, a default route to the internet edge, or a more specific route via an old VPN concentrator), sessions break asymmetrically.
- Multiple SCs (for example, two DCs): use BGP attributes (AS-path prepend, MED) and Prisma Access backbone routing settings ⚠️ to control which DC is preferred.
- An SC isn't an internet egress path by default. **Traffic Steering** can forward chosen traffic (such as destinations that require on-prem source-IP allow-listing) out through an SC or a dedicated egress ⚠️.

**ZTNA Connector (✅ concept, ⚠️ details):**
- A VM near the apps, deployed in **connector groups**. Tunnels are **outbound** to Prisma Access.
- **App targets** are FQDNs, wildcard domains, or IP subnets. Users never get routes to the DC.
- The app sees traffic sourced from the connector (NAT) ⚠️, which affects app logs and IP-based ACLs on the server.
- DNS: wildcard/FQDN targets are resolved through the connector's site DNS ⚠️. Verify how DNS resolution is split.

---

## §6 Traffic flows (practice drawing each one)

### Flow 1: Mobile user → Internet
`Laptop → GP tunnel → MU-SPN (nearest location) → [decrypt? → App-ID → User-ID → URL/Threat/DNS/DLP] → egress IP of location → Internet`

### Flow 2: Mobile user → Microsoft 365
Same as Flow 1, with these design choices:
- Tenant restriction header insertion to block personal tenants.
- Decryption exclusions or a selective policy for Microsoft's "Optimize" category endpoints (often split-tunneled locally for Teams media) ⚠️ (follow current Palo Alto guidance).
- SaaS Security inline for activity control, and API for data at rest.

### Flow 3: Mobile user → private app via Service Connection
`Laptop → GP → MU-SPN (policy: user/group, App-ID, HIP, profiles) → Prisma Access backbone → SC node → IPsec → DC edge → app`
`Return: app → DC routing (must route the MU pool to the SC!) → IPsec → SC → backbone → MU-SPN → laptop`
DNS: the MU-SPN proxies internal domains to the internal DNS servers you configured, which are reachable via the SC.

### Flow 4: Mobile user → private app via ZTNA Connector
`Laptop → GP → MU-SPN (policy against the connector app target) → connector tunnel (outbound-initiated from the connector) → connector → (NAT) → app`

### Flow 5: Branch → DC
`Branch LAN → ION (path policy) → IPsec → RN-SPN (policy) → backbone → SC → DC`
Alternative: the ION secure fabric directly to a DC ION, which bypasses Prisma Access for trusted east-west traffic. 🔶 That's a design decision: inspection in the cloud vs. latency and cost. Many designs send branch-to-DC traffic over the SD-WAN fabric and inspect it at the DC NGFW.

### Flow 6: Mobile user ↔ Branch
Through the Prisma Access backbone. MU-SPN and RN-SPN are in the same routing domain ✅, so policy applies on the path.

---

## §7 Identity architecture

- **CIE** syncs users and groups from Entra ID, AD (via an agent), Okta, Google, and others, and provides SAML authentication profiles for Prisma Access ✅.
- Policy uses **groups** from CIE, **HIP profiles**, and optionally **Dynamic User Groups** (tag-based, for automation and quarantine).
- **ISE integration** (your strength): campus identity from ISE can feed PAN-OS User-ID via syslog or pxGrid integrations ⚠️. In SASE, CIE + IdP become the source of truth for remote users, while ISE remains the campus NAC.

---

## §8 Management and operations

- **Cloud-managed (SCM)** vs. **Panorama-managed** Prisma Access. See file 02 §13.
- **Logs:** Strata Logging Service. SIEM forwarding (syslog/HTTPS) ⚠️ or Cortex XSIAM.
- **AIOps:** best practice assessments, capacity forecasting, and upgrade and health alerts.
- **ADEM:** user and site experience.
- **Upgrades:** Palo Alto manages dataplane upgrades on Prisma Access. Customers pick the upgrade window/preferences ⚠️.

---

## §9 Model answers for the check in 00-START-HERE

**1. Why a ZTNA Connector instead of a service connection? When would you still need an SC?**
ZTNA Connector: no inbound IPsec peer or exposure on the DC edge, no BGP/route changes, overlapping IPs tolerated (useful for M&A and cloud VPCs), app-scoped access by design, and quick deployment by app owners. You still need an SC when (a) apps or servers initiate connections to users or branches (for example, SCCM push, VoIP callbacks, helpdesk remote control), (b) branches on remote networks need DC reachability via Prisma Access, (c) you need dynamic routing integration with the DC, or (d) you need Traffic Steering egress via on-prem.

**2. Prisma Access location vs. compute location?**
The location is where users and sites connect and the localized egress identity. The compute location is the cloud region that actually hosts the processing. Several locations can map to one compute location. That affects latency (the hidden hop to compute), egress IP geography, and how RN bandwidth is allocated.

**3. "Prisma Access is PAN-OS in the cloud": one enablement benefit, one customer consequence.**
Enablement benefit: one policy model and one set of App-ID/Content-ID skills across NGFW and SASE, so SE competency transfers and labs can share a common core curriculum. Customer consequence: Prisma Access is operated like a firewall (rules, zones, NAT concepts, commit/push), which suits network security teams but is a heavier mental model for teams coming from proxy-only SSE, and they may need change management and training.

---

## §10 Ten-point whiteboard checklist (use it in the interview)
1. Users, sites, and apps: three onboarding paths
2. Identity source and posture
3. Policy: App-ID + user + HIP + profiles
4. Decryption strategy and exclusions
5. Private app path (SC vs. connector) and **return routing**
6. **DNS** for internal domains
7. Egress IPs and SaaS allow-listing
8. HA (dual tunnels, connector groups, dual SCs)
9. Management (SCM vs. Panorama), logging, ADEM
10. Migration phases and success criteria

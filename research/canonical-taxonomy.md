# Web Pentesting — Canonical Taxonomy
_Sourced 2026-05-05. URLs at the bottom._

This file is the authoritative reference for vulnerability-class naming, ID-tagging, and topic structure used in the nullpath skill graph. All names, IDs, and sub-topics are taken verbatim from the linked sources — do not paraphrase them in graph nodes if a canonical name exists here.

---

## OWASP Top 10 (Web) — 2025 (current edition)

The 2025 edition is the active list as of the source date. Categories are renamed and reordered vs 2021; both editions are widely tagged in the wild, so 2021 is preserved below as a historical mapping.

- **A01:2025 Broken Access Control** — auth-Z failures: privilege escalation, IDOR, missing function-level checks, force-browsing.
- **A02:2025 Security Misconfiguration** — default creds, verbose errors, exposed admin panels, missing headers, cloud/storage exposure.
- **A03:2025 Software Supply Chain Failures** — vulnerable/outdated deps, malicious packages, dependency confusion, compromised build pipelines.
- **A04:2025 Cryptographic Failures** — plaintext storage/transit, weak ciphers/hashes, bad key management, predictable randomness.
- **A05:2025 Injection** — SQLi, NoSQLi, OS command, LDAP, XPath, CRLF, code injection, ORM injection (XSS folded under injection in 2021 still applies here).
- **A06:2025 Insecure Design** — missing threat model, lack of rate limiting, business-logic flaws, insecure flow design.
- **A07:2025 Authentication Failures** — credential stuffing, brute force, weak MFA, broken session management, predictable tokens.
- **A08:2025 Software or Data Integrity Failures** — unsigned updates, insecure deserialization, untrusted CI/CD plugins, integrity-less data flows.
- **A09:2025 Security Logging and Alerting Failures** — missing audit logs, unmonitored failures, no alerting on auth/access anomalies.
- **A10:2025 Mishandling of Exceptional Conditions** — error-path bugs, race conditions exposed via failures, fail-open logic, exception leakage. _(New in 2025 — replaces 2021's A10 SSRF, which moved into Broken Access Control / Injection territory.)_

### OWASP Top 10 — 2021 (still in active use; tag both when migrating older content)

- **A01:2021 Broken Access Control**
- **A02:2021 Cryptographic Failures**
- **A03:2021 Injection** — includes XSS in 2021's mapping.
- **A04:2021 Insecure Design**
- **A05:2021 Security Misconfiguration**
- **A06:2021 Vulnerable and Outdated Components**
- **A07:2021 Identification and Authentication Failures**
- **A08:2021 Software and Data Integrity Failures**
- **A09:2021 Security Logging and Monitoring Failures**
- **A10:2021 Server-Side Request Forgery (SSRF)**

---

## OWASP API Security Top 10 — 2023 (current edition)

- **API1:2023 Broken Object Level Authorization** — IDOR at the API tier; per-object auth-Z missing.
- **API2:2023 Broken Authentication** — token mishandling, weak credential flows, no MFA on API auth.
- **API3:2023 Broken Object Property Level Authorization** — merges 2019's Excessive Data Exposure + Mass Assignment; over-permissive read/write of object fields.
- **API4:2023 Unrestricted Resource Consumption** — no rate limits, no quotas, billable-resource abuse, ReDoS at API endpoints.
- **API5:2023 Broken Function Level Authorization** — admin/privileged endpoints reachable by non-privileged callers.
- **API6:2023 Unrestricted Access to Sensitive Business Flows** — automation of flows like checkout/booking/comment without anti-automation controls.
- **API7:2023 Server Side Request Forgery** — SSRF at the API layer (URL-as-parameter sinks).
- **API8:2023 Security Misconfiguration** — defaults, verbose errors, missing security headers, permissive CORS.
- **API9:2023 Improper Inventory Management** — shadow/zombie APIs, unversioned endpoints, undocumented hosts.
- **API10:2023 Unsafe Consumption of APIs** — trusting third-party API responses without validation; downstream injection via upstream API.

---

## OWASP Top 10 for LLM Applications — 2025 (v2025, current edition)

The 2023 v1 list (LLM01–10 with different names) is superseded; tag both when migrating older notes.

- **LLM01:2025 Prompt Injection** — direct + indirect; jailbreak; system-prompt override.
- **LLM02:2025 Sensitive Information Disclosure** — model leaks PII, secrets, training data.
- **LLM03:2025 Supply Chain** — compromised model weights, poisoned datasets, malicious adapters/plugins.
- **LLM04:2025 Data and Model Poisoning** — training/fine-tune/RAG-corpus poisoning.
- **LLM05:2025 Improper Output Handling** — downstream injection (XSS/SSRF/SQLi/RCE) via unfiltered model output.
- **LLM06:2025 Excessive Agency** — over-broad tool/plugin permissions; missing human-in-the-loop on destructive actions.
- **LLM07:2025 System Prompt Leakage** — disclosure of system prompt contents enabling targeted attacks.
- **LLM08:2025 Vector and Embedding Weaknesses** — embedding inversion, cross-tenant retrieval leaks, RAG poisoning.
- **LLM09:2025 Misinformation** — hallucinations propagating into security-relevant decisions.
- **LLM10:2025 Unbounded Consumption** — wallet attacks, token-cost DoS, model extraction via mass querying.

---

## PortSwigger Web Security Academy — Topics

Source: https://portswigger.net/web-security/all-topics
Top-level grouping (Server-side / Client-side / Advanced) and topic names are exact. Sub-topics are taken from each topic's page section headers.

### Server-side topics

#### SQL injection
- What is SQL injection (SQLi)?
- How to detect SQL injection vulnerabilities
- SQL injection in different parts of the query
- SQL injection examples
  - Retrieving hidden data
  - Subverting application logic
  - Retrieving data from other database tables
- Blind SQL injection vulnerabilities
  - Exploiting blind SQLi by triggering conditional responses
  - Error-based SQL injection
  - Exploiting blind SQLi by triggering conditional errors
  - Extracting sensitive data via verbose SQL error messages
  - Exploiting blind SQLi by triggering time delays
  - Exploiting blind SQLi using out-of-band (OAST) techniques
- Second-order SQL injection
- Examining the database
- SQL injection in different contexts
- How to prevent SQL injection

#### Authentication
- Vulnerabilities in authentication mechanisms
- Vulnerabilities in third-party authentication mechanisms
- Preventing attacks on your own authentication mechanisms

#### Path traversal
- Reading arbitrary files via path traversal
- Common obstacles to exploiting path traversal vulnerabilities
- How to prevent a path traversal attack

#### Command injection (OS command injection)
- Injecting OS commands
- Useful commands
- Blind OS command injection vulnerabilities
  - Detecting blind OS command injection using time delays
  - Exploiting blind OS command injection by redirecting output
  - Exploiting blind OS command injection using out-of-band (OAST) techniques
- Ways of injecting OS commands
- How to prevent OS command injection attacks

#### Business logic vulnerabilities
- How do business logic vulnerabilities arise?
- What are some examples of business logic vulnerabilities?
- How to prevent business logic vulnerabilities

#### Information disclosure
- Examples of information disclosure
- How do information disclosure vulnerabilities arise?
- How to assess the severity of information disclosure vulnerabilities
- Exploiting information disclosure
- How to prevent information disclosure vulnerabilities

#### Access control
- Vertical access controls
- Horizontal access controls
- Context-dependent access controls
- Examples of broken access controls
  - Vertical privilege escalation
  - Horizontal privilege escalation
  - Horizontal to vertical privilege escalation
  - Insecure direct object references (IDOR)
  - Access control vulnerabilities in multi-step processes
  - Referer-based access control
  - Location-based access control
- How to prevent access control vulnerabilities

#### File upload vulnerabilities
- How do web servers handle requests for static files?
- Exploiting unrestricted file uploads to deploy a web shell
- Exploiting flawed validation of file uploads
  - Flawed file type validation
  - Preventing file execution in user-accessible directories
  - Insufficient blacklisting of dangerous file types
  - Overriding the server configuration
  - Obfuscating file extensions
  - Flawed validation of the file's contents
- Exploiting file upload race conditions
  - Race conditions in URL-based file uploads
- Exploiting file upload vulnerabilities without remote code execution
  - Uploading malicious client-side scripts
  - Exploiting vulnerabilities in the parsing of uploaded files
- Uploading files using PUT
- How to prevent file upload vulnerabilities

#### Race conditions
- Limit overrun race conditions
  - Detecting/exploiting limit overrun with Burp Repeater
  - Detecting/exploiting limit overrun with Turbo Intruder
- Hidden multi-step sequences
- Methodology
  - Predict potential collisions
  - Probe for clues
  - Prove the concept
- Multi-endpoint race conditions
  - Aligning multi-endpoint race windows
- Single-endpoint race conditions
- Session-based locking mechanisms
- Partial construction race conditions
- Time-sensitive attacks
- How to prevent race condition vulnerabilities

#### Server-side request forgery (SSRF)
- Common SSRF attacks
  - SSRF attacks against the server
  - SSRF attacks against other back-end systems
- Circumventing common SSRF defenses
  - SSRF with blacklist-based input filters
  - SSRF with whitelist-based input filters
  - Bypassing SSRF filters via open redirection
- Blind SSRF vulnerabilities
- Finding hidden attack surface for SSRF vulnerabilities
  - Partial URLs in requests
  - URLs within data formats
  - SSRF via the Referer header

#### XXE injection
- What are the types of XXE attacks?
- Exploiting XXE to retrieve files
- Exploiting XXE to perform SSRF attacks
- Blind XXE vulnerabilities
- Finding hidden attack surface for XXE injection
  - XInclude attacks
  - XXE attacks via file upload
  - XXE attacks via modified content type
- How to find and test for XXE vulnerabilities
- How to prevent XXE vulnerabilities

#### NoSQL injection
- Types of NoSQL injection
- Detecting syntax injection in MongoDB
- NoSQL operator injection
  - Submitting query operators
  - Detecting operator injection in MongoDB
- Exploiting syntax injection to extract data
  - Exfiltrating data in MongoDB
- Exploiting NoSQL operator injection to extract data
  - Injecting operators in MongoDB
- Timing based injection
- Preventing NoSQL injection

#### API testing
- API recon
- API documentation
  - Discovering API documentation
  - Using machine-readable documentation
- Identifying API endpoints
- Interacting with API endpoints
- Mass assignment vulnerabilities
- Preventing vulnerabilities in APIs

#### Web cache deception
- Web caches
- Cache keys
- Cache rules
- Constructing a web cache deception attack
  - Using a cache buster
  - Detecting cached responses
- Exploiting static extension cache rules
  - Path mapping discrepancies + Exploiting path mapping discrepancies
  - Delimiter discrepancies + Exploiting delimiter discrepancies
  - Delimiter decoding discrepancies + Exploiting delimiter decoding discrepancies
- Exploiting static directory cache rules
  - Normalization discrepancies (origin server / cache server)
  - Detecting + Exploiting each
- Exploiting file name cache rules
  - Detecting normalization discrepancies
  - Exploiting normalization discrepancies
- Preventing web cache deception vulnerabilities

### Client-side topics

#### Cross-site scripting (XSS)
- How does XSS work?
- XSS proof of concept
- What are the types of XSS attacks?
  - Reflected cross-site scripting
  - Stored cross-site scripting
  - DOM-based cross-site scripting
- What can XSS be used for?
- How to find and test for XSS vulnerabilities
- Content security policy (CSP)
- Dangling markup injection
- How to prevent XSS attacks

#### Cross-site request forgery (CSRF)
- How does CSRF work?
- How to construct a CSRF attack
- How to deliver a CSRF exploit
- Common defences against CSRF

#### Cross-origin resource sharing (CORS)
- Same-origin policy
- Relaxation of the same-origin policy
- Vulnerabilities arising from CORS configuration issues
  - Server-generated ACAO header from client-specified Origin header
  - Errors parsing Origin headers
  - Whitelisted null origin value
  - Exploiting XSS via CORS trust relationships
  - Breaking TLS with poorly configured CORS
  - Intranets and CORS without credentials
- How to prevent CORS-based attacks
  - Avoid whitelisting null
  - Avoid wildcards in internal networks
  - CORS is not a substitute for server-side security policies

#### Clickjacking
- How to construct a basic clickjacking attack
- Clickbandit
- Clickjacking with prefilled form input
- Frame busting scripts
- Combining clickjacking with a DOM XSS attack
- Multistep clickjacking
- How to prevent clickjacking attacks
  - X-Frame-Options
  - Content Security Policy (CSP)

#### DOM-based vulnerabilities
- What is the DOM?
- Taint-flow vulnerabilities
  - What is taint flow? (Sources / Sinks)
  - Common sources
  - Which sinks can lead to DOM-based vulnerabilities?
  - How to prevent DOM-based taint-flow vulnerabilities
- DOM clobbering

#### WebSockets
- Manipulating WebSocket traffic
  - Intercepting and modifying WebSocket messages
  - Replaying and generating new WebSocket messages
- Manipulating WebSocket connections
- WebSockets security vulnerabilities
  - Manipulating WebSocket messages to exploit vulnerabilities
  - Manipulating the WebSocket handshake to exploit vulnerabilities
  - Using cross-site WebSockets to exploit vulnerabilities (CSWSH)
- How to secure a WebSocket connection

### Advanced topics

#### Insecure deserialization
- What is serialization? (Serialization vs deserialization)
- How do insecure deserialization vulnerabilities arise?
- How to exploit insecure deserialization vulnerabilities
- How to prevent insecure deserialization vulnerabilities

#### Web LLM attacks
- What is a large language model?
- LLM attacks and prompt injection
- Detecting LLM vulnerabilities
- Exploiting LLM APIs, functions, and plugins
  - How LLM APIs work
  - Mapping LLM API attack surface
  - Chaining vulnerabilities in LLM APIs
- Insecure output handling
- Indirect prompt injection
- Training data poisoning
- Leaking sensitive training data
- Defending against LLM attacks
  - Treat APIs given to LLMs as publicly accessible
  - Don't feed LLMs sensitive data
  - Don't rely on prompting to block attacks
- AI-powered scanner vulnerabilities

#### GraphQL API vulnerabilities
- Finding GraphQL endpoints (universal queries, common endpoint names, request methods)
- Initial testing
- Exploiting unsanitized arguments (IDOR over GraphQL)
- Discovering schema information (introspection, suggestions)
- Bypassing rate limiting using aliases (alias overloading / batching)
- Bypassing authentication / brute force via batching
- CSRF over GraphQL (when GET or form-encoded POST accepted)
- Preventing GraphQL attacks (disable introspection in prod, query depth/cost limits, no batching for sensitive ops)

#### Server-side template injection (SSTI)
- How do SSTI vulnerabilities arise?
- Constructing a server-side template injection attack
  - Detect
  - Identify
  - Exploit
- How to prevent server-side template injection vulnerabilities

#### Web cache poisoning
- How does a web cache work?
- Constructing a web cache poisoning attack
  - Identify and evaluate unkeyed inputs
  - Elicit a harmful response from the back-end server
  - Get the response cached
- Exploiting web cache poisoning vulnerabilities
- How to prevent web cache poisoning vulnerabilities

#### HTTP Host header attacks
- Virtual hosting
- Routing traffic via an intermediary
- How does the HTTP Host header solve this problem?
- How do HTTP Host header vulnerabilities arise?
- Exploiting HTTP Host header vulnerabilities
- How to prevent HTTP Host header attacks

#### HTTP request smuggling
- How do HTTP request smuggling vulnerabilities arise?
- How to perform an HTTP request smuggling attack
  - CL.TE vulnerabilities
  - TE.CL vulnerabilities
  - TE.TE behavior: obfuscating the TE header
- How to identify HTTP request smuggling vulnerabilities
- How to exploit HTTP request smuggling vulnerabilities
- Advanced HTTP request smuggling
- Browser-powered request smuggling
- How to prevent HTTP request smuggling vulnerabilities

#### OAuth authentication
- How does OAuth 2.0 work?
- OAuth authentication (vs authorization)
- How do OAuth authentication vulnerabilities arise?
- Identifying OAuth authentication (Recon)
- Exploiting OAuth authentication vulnerabilities
  - Vulnerabilities in the OAuth client application
  - Leaking authorization codes and access tokens
  - Flawed scope validation
  - Unverified user registration
- Extending OAuth with OpenID Connect (OIDC)
- Preventing OAuth authentication vulnerabilities

#### JWT attacks
- JWT format / JWT signature / JWT vs JWS vs JWE
- How do vulnerabilities to JWT attacks arise?
- How to work with JWTs in Burp Suite
- Exploiting flawed JWT signature verification
  - Accepting arbitrary signatures
  - Accepting tokens with no signature (alg=none)
  - Brute-forcing secret keys (incl. with hashcat)
- JWT header parameter injections
  - Injecting self-signed JWTs via the jwk parameter
  - Injecting self-signed JWTs via the jku parameter
  - Injecting self-signed JWTs via the kid parameter
  - Other interesting JWT header parameters
- JWT algorithm confusion (RS256 -> HS256)
- How to prevent JWT attacks

#### Prototype pollution
- How do prototype pollution vulnerabilities arise?
- Prototype pollution sources
  - Prototype pollution via the URL
  - Prototype pollution via JSON input
- Prototype pollution sinks
- Prototype pollution gadgets
- Server-side prototype pollution (covered in deeper subpages)
- Client-side prototype pollution (covered in deeper subpages)

#### Essential skills
- Obfuscating attacks using encodings
- Using Burp Scanner during manual testing
- Identifying unknown vulnerabilities

---

## CWE Reference (web-relevant)

All entries below confirmed against MITRE CWE 4.20. Use these as the canonical tag IDs on graph nodes.

### Injection family
- **SQL Injection — CWE-89:** Improper Neutralization of Special Elements used in an SQL Command ('SQL Injection')
- **NoSQL Injection — CWE-943:** Improper Neutralization of Special Elements in Data Query Logic
- **OS Command Injection — CWE-78:** Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection')
- **Command Injection (generic) — CWE-77:** Improper Neutralization of Special Elements used in a Command ('Command Injection')
- **Code Injection — CWE-94:** Improper Control of Generation of Code ('Code Injection')
- **LDAP Injection — CWE-90:** Improper Neutralization of Special Elements used in an LDAP Query ('LDAP Injection')
- **XPath Injection — CWE-643:** Improper Neutralization of Data within XPath Expressions ('XPath Injection')
- **CRLF Injection — CWE-93:** Improper Neutralization of CRLF Sequences ('CRLF Injection')
- **HTTP Response Splitting — CWE-113:** Improper Neutralization of CRLF Sequences in HTTP Headers ('HTTP Request/Response Splitting')
- **Server-Side Template Injection — CWE-1336:** Improper Neutralization of Special Elements Used in a Template Engine
- **XML External Entity (XXE) — CWE-611:** Improper Restriction of XML External Entity Reference

### Cross-site / client-side
- **Cross-site Scripting (umbrella) — CWE-79:** Improper Neutralization of Input During Web Page Generation ('Cross-site Scripting')
  - Reflected, Stored, and DOM-Based XSS are all classified under CWE-79 per MITRE; sub-types are tracked as alternate terms, not separate CWE IDs.
  - **Basic XSS — CWE-80** (child of 79): Improper Neutralization of Script-Related HTML Tags in a Web Page (Basic XSS)
- **Cross-Site Request Forgery — CWE-352:** Cross-Site Request Forgery (CSRF)
- **Clickjacking / UI Redressing — CWE-1021:** Improper Restriction of Rendered UI Layers or Frames
- **Permissive CORS — CWE-942:** Permissive Cross-domain Security Policy with Untrusted Domains
- **Open Redirect — CWE-601:** URL Redirection to Untrusted Site ('Open Redirect')
- **Prototype Pollution — CWE-1321:** Improperly Controlled Modification of Object Prototype Attributes ('Prototype Pollution')

### Server-side / infrastructure
- **Server-Side Request Forgery (SSRF) — CWE-918:** Server-Side Request Forgery (SSRF)
- **Path Traversal — CWE-22:** Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal')
- **Unrestricted File Upload — CWE-434:** Unrestricted Upload of File with Dangerous Type
- **Insecure Deserialization — CWE-502:** Deserialization of Untrusted Data
- **HTTP Request Smuggling — CWE-444:** Inconsistent Interpretation of HTTP Requests ('HTTP Request/Response Smuggling')
- **Web Cache Poisoning / Deception — CWE-349:** Acceptance of Extraneous Untrusted Data With Trusted Data _(MITRE has no separate cache-poisoning CWE; this is the standard mapping; cache deception is also commonly tagged CWE-444 when smuggling-adjacent.)_
- **Race Condition — CWE-362:** Concurrent Execution using Shared Resource with Improper Synchronization ('Race Condition')
- **Uncontrolled Resource Consumption (DoS, ReDoS root) — CWE-400**
- **ReDoS — CWE-1333:** Inefficient Regular Expression Complexity

### Auth-N / Auth-Z
- **Improper Authentication — CWE-287**
- **Missing Authentication for Critical Function — CWE-306**
- **Missing Authorization — CWE-862**
- **IDOR / Authorization Bypass via User-Controlled Key — CWE-639:** Authorization Bypass Through User-Controlled Key
- **Use of Hard-coded Credentials — CWE-798**
- **Session Fixation — CWE-384**
- **Weak Password Hash — CWE-916:** Use of Password Hash With Insufficient Computational Effort

### Crypto / signature / token
- **Insufficient Verification of Data Authenticity — CWE-345** _(general bucket for "trusts unverified data" — applies to many JWT/OAuth issues)_
- **Improper Verification of Cryptographic Signature — CWE-347** _(canonical for JWT alg=none, signature stripping)_
- **Algorithm Downgrade — CWE-757:** Selection of Less-Secure Algorithm During Negotiation _(applies to JWT alg confusion RS256→HS256)_
- _OAuth — no single canonical CWE._ Common per-issue mappings: CWE-352 (CSRF on the auth code flow / missing state), CWE-601 (open redirect on redirect_uri), CWE-345/347 (id_token signature issues), CWE-287 (broken auth in general), CWE-863 (incorrect authorization for scope checks).

### Mass assignment / business logic
- **Mass Assignment — CWE-915:** Improperly Controlled Modification of Dynamically-Determined Object Attributes
- **Business Logic Errors (CATEGORY) — CWE-840** _(this is a category, not a weakness; use it as a parent tag, then attach the specific child CWE for the actual flaw)_

### Information disclosure / misconfiguration
- **Exposure of Sensitive Information to an Unauthorized Actor — CWE-200**
- **Insertion of Sensitive Information into Log File — CWE-532**
- **Files or Directories Accessible to External Parties — CWE-552**
- **Incorrect Default Permissions — CWE-276**

### Supply chain
- **Dependency on Vulnerable Third-Party Component — CWE-1395**
- **Use of Unmaintained Third Party Components — CWE-1104**
- **Reliance on Insufficiently Trustworthy Component — CWE-1357** _(commonly tagged for dependency confusion / typosquat scenarios)_
- **Inclusion of Functionality from Untrusted Control Sphere — CWE-829** _(also used for dependency confusion when the untrusted source is a public registry)_

### Memory-safety (for parser bugs in web stack — Nginx/Apache/curl-style)
- **Out-of-bounds Write — CWE-787**
- **Out-of-bounds Read — CWE-125**
- **Use After Free — CWE-416**
- **NULL Pointer Dereference — CWE-476**
- **Integer Overflow — CWE-190**
- **Buffer Bounds — CWE-119**
- **Improper Input Validation — CWE-20** _(catch-all parent — avoid as primary tag if a more specific CWE applies.)_

### CWE Top 25 (2022) — for reference
The current "Top 25 Most Dangerous Software Weaknesses" view is CWE-1387; the entries (in MITRE-published rank order from that view) are: 787, 79, 89, 20, 125, 78, 416, 22, 352, 434, 476, 502, 190, 287, 798, 862, 77, 306, 119, 276, 918, 362, 400, 611, 94. Web-relevant subset: 79, 89, 20, 78, 22, 352, 434, 502, 287, 798, 862, 77, 306, 276, 918, 362, 400, 611, 94.

---

## Tooling categories (PortSwigger-aligned, not from a single source — derived from the topic pages)

These are not CWE/OWASP IDs but show up in graph nodes as "tool" tags. Listed here so the graph uses consistent labels.

- **Intercepting proxy / repeater / intruder:** Burp Suite (Community / Professional), OWASP ZAP, Caido.
- **Scanner:** Burp Scanner, ZAP active/passive scan, Nuclei, Nikto, Wapiti.
- **Recon / discovery:** ffuf, gobuster, feroxbuster, dirsearch, subfinder, amass, httpx, katana, gau, waybackurls.
- **Fuzzing / param discovery:** ffuf, wfuzz, Arjun, ParamMiner (Burp), Param Spider.
- **SQLi:** sqlmap, Ghauri, NoSQLMap (NoSQLi).
- **XSS:** XSStrike, Dalfox, kxss.
- **SSRF / OAST:** Burp Collaborator, interact.sh / interactsh-client, ngrok.
- **Smuggling / HTTP:** Smuggler.py, http-request-smuggler (Burp ext), Turbo Intruder.
- **JWT:** jwt_tool, jwt.io, hashcat (alg HMAC bruteforce), Burp JWT Editor extension.
- **Deserialization:** ysoserial, ysoserial.net, marshalsec, phpggc.
- **Race conditions:** Turbo Intruder, race-the-web, Burp Repeater "send group in parallel" (single-packet attack).
- **Prototype pollution:** PPScan / DOM Invader (Burp), ppmap.
- **GraphQL:** InQL, graphql-cop, Clairvoyance, graphw00f.
- **CORS:** CORScanner, Corsy.
- **WebSocket:** Burp's WebSocket history, websocket-king (debugging), Socket Sleuth (Burp ext).
- **Cache:** Param Miner (Burp), web-cache-vulnerability-scanner.
- **LLM:** garak, PyRIT, promptfoo (red team mode), Burp's AI features.
- **Reporting / proof:** Dradis, Faraday, Serpico, plain markdown.

---

## Sources

All URLs fetched 2026-05-05 unless otherwise noted.

- **PortSwigger Web Security Academy — All topics:** https://portswigger.net/web-security/all-topics
  - Plus each topic page directly (e.g. https://portswigger.net/web-security/sql-injection, /authentication, /file-path-traversal, /os-command-injection, /logic-flaws, /information-disclosure, /access-control, /file-upload, /race-conditions, /ssrf, /xxe, /nosql-injection, /api-testing, /web-cache-deception, /cross-site-scripting, /csrf, /cors, /clickjacking, /dom-based, /websockets, /deserialization, /llm-attacks, /graphql, /server-side-template-injection, /web-cache-poisoning, /host-header, /request-smuggling, /oauth, /jwt, /prototype-pollution, /essential-skills) and the SQLi-blind subpage.
- **OWASP Top 10:2025 (current):** https://owasp.org/Top10/  →  https://owasp.org/Top10/2025/  (book site, 10 categories listed)
- **OWASP Top 10:2021 (historical mapping):** https://owasp.org/www-project-top-ten/ + https://owasp.org/Top10/A01_2021-Broken_Access_Control/ (verified via Wayback Machine snapshot https://web.archive.org/web/2024/https://owasp.org/Top10/ since the live owasp.org/Top10/ now redirects to the 2025 book)
- **OWASP API Security Top 10 (2023, current):** https://owasp.org/www-project-api-security/
- **OWASP Top 10 for LLM Applications — 2025 (current):** https://genai.owasp.org/llm-top-10/  (the older https://owasp.org/www-project-top-10-for-large-language-model-applications/ links forward to the 2025 list at genai.owasp.org)
- **MITRE CWE Top 25:** https://cwe.mitre.org/data/definitions/1387.html (the "Weaknesses in the 2022 CWE Top 25" view at the time of fetch — this is what 1387 currently resolves to on cwe.mitre.org; CWE 4.20)
- **MITRE CWE — individual definitions** (each fetched at https://cwe.mitre.org/data/definitions/{N}.html): 22, 78, 79, 80, 89, 90, 93, 94, 113, 119, 125, 190, 200, 276, 287, 306, 345, 347, 349, 352, 362, 384, 400, 416, 434, 444, 476, 502, 532, 552, 601, 611, 639, 643, 757, 787, 798, 829, 840, 862, 915, 916, 918, 942, 1021, 1104, 1321, 1333, 1336, 1357, 1395.

### Not fetched in this pass (optional sources)
- HackTricks Web index (https://book.hacktricks.wiki/en/network-services-pentesting/pentesting-web/index.html) — skipped to keep the scope tight; the categories there map closely onto the PortSwigger topics above.
- OWASP ASVS v4 categories — skipped; if you want them, the canonical chapters are V1 Architecture, V2 Authentication, V3 Session Management, V4 Access Control, V5 Validation/Sanitization/Encoding, V6 Stored Cryptography, V7 Error Handling and Logging, V8 Data Protection, V9 Communication, V10 Malicious Code, V11 Business Logic, V12 Files and Resources, V13 API and Web Service, V14 Configuration. Add when needed; not pulled from a live source in this fetch.

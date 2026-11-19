# Frontend Security and Integrity Audit (Requirement R2: Web P0 #2–6)

**Project:** Jobsclick (Indian Job Portal Platform)  
**Document Reference:** `docs/audits/01-frontend-security-integrity.md`  
**Specification Authority:** `docs/PRD.md` (v1.3/v1.4), `docs/decisions/001-client-decisions.md`, `AGENTS.md`, `ORIGINAL_REQUEST.md`  
**Audit Date:** November 3, 2026  
**Auditor:** Principal Frontend Security Architect & Senior Application Security Tester (Worker M1)  
**Audit Scope:** Web Application (`apps/web`), Shared UI Components (`packages/ui`), Validation Schemas (`packages/validation`)  
**Integrity Mode:** Production Readiness & Frontend Security Inspection (Local Mock / Offline Code Tracing)  

---

## 1. Executive Summary

A comprehensive, line-by-line security and operational integrity audit was executed across the frontend application (`apps/web`), shared UI primitives (`packages/ui`), and client-side validation contracts (`packages/validation`) in accordance with **Requirement R2** of the Master Production Readiness Audit Plan. 

The audit systematically evaluated three core threat vectors and architectural boundaries:
1. **Client-Side Token Generation & Development Auth Backdoors:** Evaluating whether production-bundled client code synthesizes unverified cryptographic assertions, generates fake session tokens (`jwt_session_*`), or injects spoofable identity headers (`x-user-id: admin_root`, `usr_seeker_77`, `usr_employer_55`) to bypass backend authentication gates.
2. **UI Optimistic State & False-Success Error Handling:** Auditing all action buttons, workspace form submissions, and asynchronous mutation handlers to identify instances where the UI renders "Success!" banners, green toasts, or simulated transactional states when underlying backend requests fail (HTTP 4xx/5xx) or suffer network drops.
3. **Cross-Site Scripting (XSS), Dangerous Attribute Bindings & Injection Vectors:** Inspecting DOM injection sinks, JSON-LD structured metadata scripts (`dangerouslySetInnerHTML`), unescaped URL bindings (`href` with `javascript:` URIs), iframe integrations, SVG payloads, and QR code generators.

### Audit Verdict: **NOT PRODUCTION READY (Launch Blocking — Critical Security & Integrity Vulnerabilities)**

The audit uncovered multiple critical vulnerabilities, high-severity authentication disconnects, and deceptive user interface behaviors that pose acute risks to platform security, regulatory compliance, and commercial trust:

- **Stored Cross-Site Scripting (XSS) via Structured Metadata (CWE-79 / P0 Security):** Public job posting pages (`/jobs/[id]`), company profiles (`/company/[id]`), and institution directories (`/institution/[id]`, `/institutions`) serialize unescaped user-controlled text directly into inline `<script type="application/ld+json">` tags using standard `JSON.stringify(...)`. An attacker submitting a vacancy or company profile containing `</script><script>...` prematurely breaks the HTML script context and executes arbitrary JavaScript in the browsers of candidates and administrative staff.
- **Stored DOM XSS via Unrestricted URL Schemes (CWE-79 / P0 Security):** Public institution profiles render `institution.website` and `placementBrochureUrl` directly into `<a href="...">` elements without scheme validation. Because `packages/validation/src/profiles.ts` relies on Zod's `z.string().url()` (which permits WHATWG-valid `javascript:` URIs), an institution can supply `javascript:alert(document.cookie)` as its website, executing malicious code whenever candidates or corporate recruiters click the link.
- **Complete Auth Disconnect & Identity Spoofing (CWE-287 / CWE-306 / P0 Integrity):** `apps/web/src/context/AppContext.tsx` hardcodes `accessToken = null` because verified authentication stores the real session token exclusively in HttpOnly cookies. Consequently, all workspace actions (candidate job applications, employer vacancy publishing, applicant status updates, admin audit log fetching, and institution updates) fall back to synthesizing fake tokens formatted as `Bearer jwt_session_${user?.id || fallback}_${Date.now()}` and injecting raw `x-user-id` headers. The backend rejects all `jwt_session_*` tokens with 401 Unauthorized (`auth-session.ts:131`), causing real authenticated requests to fail, while any endpoint trusting `x-user-id` is vulnerable to trivial identity spoofing.
- **Systematic UI Deception & False-Positive Success (P0 Operational Integrity):** Across multiple mission-critical workflows, components explicitly override backend failures with simulated client-side success states:
  - `SponsorshipCard.tsx` catches 4xx/5xx errors or network drops and synthesizes an active 1-year institutional tier with a green success banner, leaving institutions believing their students are sponsored when zero backend records exist.
  - `SaveSearchAlertModal.tsx` and `MsmeBroadcastConsole.tsx` catch 404/500 errors and immediately declare "Alert Created Successfully!" or "Broadcast Dispatched Successfully! Campaign ID: camp_... Queued to BullMQ", misleading job seekers and MSME administrators.
  - `useEmployerWorkspace.ts` catches vacancy publishing failures, synthesizes an in-memory job ID (`job-${Date.now()}`), and fires "Vacancy Published Successfully", which vanishes upon the next page reload.
  - `useSeekerWorkspace.ts` ignores backend profile save rejections (`{ success: false }`), marks onboarding complete, self-certifies Aadhaar verification (`aadhaarVerified: Boolean(formData.formAadhaarLastFour)`), and toasts success.

---

## 2. Audit Evaluation Matrix

The following matrix documents every item audited under Requirement R2 with its verified source code location, line numbers, definitive status, and summary finding.

| ID | Focus Area | Component & File Path | Lines | Definitive Status | Summary of Core Finding |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **R2-01** | Client-Side Auth | Candidate Job Application<br>`apps/web/src/components/jobs/JobApplyButton.tsx` | 61–72 | **Confirmed Bug** | Synthesizes fake `Bearer jwt_session_${user?.id || 'usr_seeker_77'}_${Date.now()}` and injects `x-user-id: usr_seeker_77` when `accessToken` is null. Backend rejects `jwt_session_*` as 401. |
| **R2-02** | Client-Side Auth | Central Administrative Workspace<br>`apps/web/src/components/workspaces/AdminWorkspace.tsx` | 42–49<br>83–85 | **Confirmed Bug** | Generates `Bearer jwt_session_${user?.id || 'admin_root'}_${Date.now()}` with `x-user-id: admin_root` to fetch audit logs and analytics. Fails 401 on verified backend, or permits root spoofing if header is trusted. |
| **R2-03** | Client-Side Auth | Employer Workspace Hooks & API<br>`apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts`<br>`apps/web/src/components/workspaces/employer/employerApi.ts` | 64–66<br>38, 57, 73, 85, 104, 119 | **Confirmed Bug** | Fallback generates `jwt_session_${user?.id || 'usr_employer_55'}_${Date.now()}` with `x-user-id: usr_employer_55` across all employer operations (jobs, applicants, profile updates). |
| **R2-04** | Client-Side Auth | Seeker Workspace Hooks & API<br>`apps/web/src/components/workspaces/seeker/useSeekerWorkspace.ts`<br>`apps/web/src/components/workspaces/seeker/seekerApi.ts` | 67–69<br>173–176<br>27, 76, 114 | **Confirmed Bug** | Generates fake `jwt_session_*` and passes `x-user-id: usr_seeker_77` for seeker profile retrieval and updates. |
| **R2-05** | Client-Side Auth | Institution Workspace Hooks<br>`apps/web/src/components/workspaces/institution/useInstitutionWorkspace.ts` | 86–90 | **Confirmed Bug** | Generates fake `jwt_session_${user?.id}_${Date.now()}` for profile retrieval and sync. |
| **R2-06** | Client-Side Auth | Phantom LocalStorage Token Reads<br>`apps/web/src/components/workspaces/institution/InstitutionCmsEditor.tsx`<br>`apps/web/src/components/workspaces/institution/SponsorshipCard.tsx` | 139, 169, 264<br>89, 95 | **Confirmed Bug** | Reads `localStorage.getItem('token')` or `localStorage.getItem('access_token')`. Real tokens live only in HttpOnly cookies; localStorage is empty, causing requests to be sent unauthenticated. |
| **R2-07** | Client-Side Auth | Unauthenticated Wallet Recharge API<br>`apps/web/src/components/wallet/RechargeModal.tsx` | 112–126<br>167–177 | **Confirmed Bug** | `fetch('/wallet/recharge/create-order')` and `/verify` omit `Authorization` header and `credentials: 'include'`, causing payment requests to fail with 401 or orphan orders. |
| **R2-08** | Client-Side Auth | Interactive Role Switcher Modal<br>`apps/web/src/components/common/RoleSwitcherModal.tsx`<br>`apps/web/src/context/AppContext.tsx` | 34, 136–139<br>164–170 | **Mitigated / Not an Issue** | Modal is strictly disabled in production builds (`process.env.NODE_ENV === 'production'`). `loginAs` in `AppContext` is a harmless modal closer and does not forge tokens or mutate session state. |
| **R2-09** | Client-Side Auth | Real Authentication Flow & Session Management<br>`apps/web/src/components/auth/AuthModal.tsx`<br>`apps/web/src/app/api/auth/session/route.ts` | 246–285<br>20–89 | **Mitigated / Not an Issue** | Production OTP and OAuth flows query verified backend endpoints (`/auth/otp/verify`), setting genuine cryptographically verified HttpOnly JWT cookies. No fake tokens generated here. |
| **R2-10** | UI False Success | Sponsorship 1-Year Success Simulation<br>`apps/web/src/components/workspaces/institution/SponsorshipCard.tsx` | 115–137 | **Confirmed Bug** | Explicit `else` and `catch` blocks simulate a 1-year active institutional tier (`oneYearLater`), display a green success banner, and trigger `onActivateSuccess` when backend returns 4xx/5xx or drops. |
| **R2-11** | UI False Success | Save Search Alert False Positive<br>`apps/web/src/components/jobs/SaveSearchAlertModal.tsx` | 52–76 | **Confirmed Bug** | Endpoint `/api/jobs/alerts` returns 404. Modal catches failure, writes to `localStorage`, and unconditionally calls `setStatus('success')` displaying green "Alert Created Successfully!". |
| **R2-12** | UI False Success | Employer Job Posting False Confirmation<br>`apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts`<br>`apps/web/src/components/workspaces/employer/employerApi.ts` | 96–115<br>81–92 | **Confirmed Bug** | `postNewJobApi` swallows 4xx/5xx errors and returns `null`. `handlePostJob` synthesizes fake `id: job-${Date.now()}`, adds it to React state, toasts "Vacancy Published Successfully", and navigates away. |
| **R2-13** | UI False Success | Seeker Profile False Success & Aadhaar Bypass<br>`apps/web/src/components/workspaces/seeker/useSeekerWorkspace.ts`<br>`apps/web/src/components/workspaces/seeker/seekerApi.ts` | 178–217<br>108–126 | **Confirmed Bug** | Disregards `saveResult.success: false`, updates local state, marks onboarding complete, self-certifies `aadhaarVerified: Boolean(formData.formAadhaarLastFour)`, and displays success toast. |
| **R2-14** | UI False Success | Public Admission Inquiry Fake Success<br>`apps/web/src/components/workspaces/institution/PublicInstitutionTabs.tsx` | 92–95 | **Confirmed Bug** | In `catch` block on network failure or 500 error, explicitly sets `setInquirySuccess(true)` simulating successful capture to the prospective student. |
| **R2-15** | UI False Success | Institution CMS Optimistic Mutation Without Rollback<br>`apps/web/src/components/workspaces/institution/InstitutionCmsEditor.tsx` | 180–191<br>262–279 | **Confirmed Bug** | Inquiry status update fails in `catch`, yet mutates local UI state to `newStatus` without rollback. CMS save error displays deceptive info toast: "Changes saved locally. Public tabs updated." |
| **R2-16** | UI False Success | Employer Fire-and-Forget Mutations<br>`apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts`<br>`apps/web/src/components/workspaces/employer/employerApi.ts` | 118–139<br>101–108, 115–132 | **Confirmed Bug** | `handleSaveProfile` calls `updateBusinessProfileApi` without `await`, immediately toasting success. `updateBusinessProfileApi` and `updateAppStatusApi` swallow all errors in empty `catch {}`. |
| **R2-17** | UI False Success | MSME Broadcast Console Fake Campaign Dispatch<br>`apps/web/src/components/workspaces/admin/MsmeBroadcastConsole.tsx` | 184–215<br>235–245 | **Confirmed Bug** | Backend route returns 404/500; both `else` and `catch` blocks synthesize fake `camp_${Date.now()}` and display green banner: "Broadcast Dispatched Successfully! Queued to BullMQ". |
| **R2-18** | UI False Success | Pure In-Memory Student Enrolment & Profile Save<br>`apps/web/src/components/workspaces/institution/useInstitutionWorkspace.ts` | 242–260<br>262–330 | **Incomplete Feature** | `handleQuickAddStudent` and `handleSaveProfile` perform pure in-memory React state mutations without any HTTP fetch calls. Data is lost upon page refresh. |
| **R2-19** | UI False Success | Missing Job Promotion Route Handler<br>`apps/web/src/components/workspaces/employer/PromoteJobModal.tsx` | 35–59 | **Incomplete Feature** | Posts to `/api/jobs/${jobId}/promote`, which does not exist in Next.js (returns 404). While error state is displayed, feature is completely inoperable. |
| **R2-20** | XSS & Injection | Stored XSS via JSON-LD `dangerouslySetInnerHTML`<br>`apps/web/src/app/jobs/[id]/page.tsx`<br>`apps/web/src/app/company/[id]/page.tsx`<br>`apps/web/src/app/institution/[id]/page.tsx`<br>`apps/web/src/app/institutions/page.tsx` | 117–120<br>121–124<br>251–254<br>156–159 | **Confirmed Bug** | User-controlled strings (`job.description`, `company.name`, `institution.about`) serialized directly into `<script type="application/ld+json">` without escaping `<`. Attacker can break context with `</script><script>`. |
| **R2-21** | XSS & Injection | Stored DOM XSS via `javascript:` URI in Website Link<br>`apps/web/src/app/institution/[id]/page.tsx`<br>`packages/validation/src/profiles.ts` | 353–360<br>111 | **Confirmed Bug** | `institution.website` rendered directly into `<a href="...">` without protocol validation. Zod schema uses `z.string().url()` which permits `javascript:` schemes, executing JS on click. |
| **R2-22** | XSS & Injection | Stored DOM XSS via `javascript:` URI in Brochure Link<br>`apps/web/src/components/workspaces/institution/InstitutionProfileCard.tsx`<br>`packages/validation/src/profiles.ts` | 122–131<br>119 | **Confirmed Bug** | `institution.placementBrochureUrl` rendered directly into `<a href="...">` without protocol validation, allowing `javascript:` execution when clicked. |
| **R2-23** | XSS & Injection | Video Iframe Embed Whitelisting & Origin Isolation<br>`apps/web/src/components/social-embed.tsx` | 9–19<br>31–38 | **Mitigated / Not an Issue** | `sanitizeUrl` validates against an explicit domain whitelist (`youtube.com`, `instagram.com`, `facebook.com`). Invalid URLs return empty string and component renders `null`. |
| **R2-24** | XSS & Injection | Profile QR Code Base64 Data URL Rendering<br>`apps/web/src/components/common/ProfileQrShareCard.tsx` | 57–67<br>134–140 | **Mitigated / Not an Issue** | Generates PNG data URL via `QRCode.toDataURL(url, ...)` bound to `<img src="...">`. Does not inject raw SVGs or execute scripts in the DOM. |
| **R2-25** | XSS & Injection | Resume Markdown & HTML Rendering Safety<br>`packages/ui/src/index.ts`<br>`apps/web/src/components/workspaces/seeker/` | N/A | **Mitigated / Not an Issue** | Seeker profiles and resumes do not use markdown-to-HTML or raw HTML parsers in the DOM; all text fields render via standard JSX string escaping `{profile.bio}`. |

---

## 3. Detailed Technical Audit Findings

```
================================================================================
SECTION 1: CLIENT-SIDE TOKEN GENERATION & AUTH BACKDOORS
================================================================================
```

### Finding 1.1: Client-Side Synthesis of `jwt_session_*` Pseudo-Tokens and Spoofable `x-user-id` Headers
- **Focus Area:** Client-side token generation & authentication integrity
- **Definitive Status:** `Confirmed Bug`
- **Location:** 
  - `apps/web/src/components/jobs/JobApplyButton.tsx`, lines 61–72
  - `apps/web/src/components/workspaces/AdminWorkspace.tsx`, lines 42–49, lines 83–85
  - `apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts`, lines 64–66
  - `apps/web/src/components/workspaces/seeker/useSeekerWorkspace.ts`, lines 67–69, lines 173–176
  - `apps/web/src/components/workspaces/institution/useInstitutionWorkspace.ts`, lines 86–90
  - `apps/web/src/components/workspaces/employer/employerApi.ts`, lines 38, 57, 73, 85, 104, 119
  - `apps/web/src/components/workspaces/seeker/seekerApi.ts`, lines 27, 76, 114
- **Verbatim Code Snippets:**

*From `JobApplyButton.tsx` (lines 61–72):*
```typescript
61:       const authHeader = accessToken
62:         ? `Bearer ${accessToken}`
63:         : `Bearer jwt_session_${user?.id || 'usr_seeker_77'}_${Date.now()}`;
64: 
65:       const res = await fetch(`${apiUrl}/jobs/${jobId}/apply`, {
66:         method: 'POST',
67:         headers: {
68:           'Content-Type': 'application/json',
69:           Authorization: authHeader,
70:           'x-user-id': user?.id || 'usr_seeker_77',
71:         },
72:       });
```

*From `AdminWorkspace.tsx` (lines 42–49):*
```typescript
42:     const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || process.env['API_URL'] || 'http://localhost:3001';
43:     const authHeader = accessToken ? `Bearer ${accessToken}` : `Bearer jwt_session_${user?.id || 'admin_root'}_${Date.now()}`;
44:     const adminId = user?.id || 'admin_root';
45: 
46:     // 1. Fetch Live Audit Logs
47:     fetch(`${apiUrl}/admin/audit-logs`, {
48:       headers: { Authorization: authHeader, 'x-user-id': adminId },
49:       signal: abortCtrl.signal,
```

*From `useEmployerWorkspace.ts` (lines 64–66):*
```typescript
64:   const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || process.env['API_URL'] || 'http://localhost:3001';
65:   const authHeader = accessToken ? `Bearer ${accessToken}` : `Bearer jwt_session_${user?.id || 'usr_employer_55'}_${Date.now()}`;
66:   const userId = user?.id || 'usr_employer_55';
```

- **Technical Root Cause & Trace:**
  1. In `apps/web/src/context/AppContext.tsx` (line 175), `const accessToken = null;` is hardcoded. The application’s architectural session model relies on HttpOnly cookies (`SESSION_COOKIE_NAME = 'auth_token'`) established during `/api/auth/session` exchange. React context never receives the raw JWT string for security reasons (preventing JavaScript extraction).
  2. Because `accessToken` is permanently `null` in React context, every workspace component and action button evaluates the ternary condition `accessToken ? ... : ...` to the fallback branch.
  3. The fallback branch fabricates a synthetic pseudo-JWT: `jwt_session_${user?.id || 'fallback_id'}_${Date.now()}` and injects an unauthenticated HTTP header: `x-user-id: ${user?.id || fallback}`.
  4. In `apps/web/src/lib/auth-session.ts` (lines 130–133), the verification engine strictly enforces:
     ```typescript
     // Hard reject legacy unsigned token format immediately
     if (token.startsWith('jwt_session_')) {
       return null;
     }
     ```
  5. The backend API (`apps/api`) expects a cryptographically signed HMAC-SHA256 JWT in the `Authorization: Bearer <token>` header. Any production-ready guard (`AuthGuard` or `JwtAuthGuard`) verifying tokens against `JWT_SECRET` immediately rejects `jwt_session_*` with HTTP 401 Unauthorized.
  6. Conversely, in test or legacy development environments where controllers read `@Headers('x-user-id')`, an unauthenticated client can impersonate any arbitrary user or system administrator simply by changing `x-user-id` to `admin_root` or an enterprise employer ID.
- **User Impact & Threat Model:**
  - **Legitimate Users (Service Outage):** Authenticated candidates attempting to apply for jobs and employers attempting to post jobs receive HTTP 401 Unauthorized errors from the backend. The application fails its primary business functions.
  - **Security Exploit (Privilege Escalation):** If any backend endpoint relies on `x-user-id` without validating cryptographic signatures, any unauthenticated attacker can inspect immutable administrative audit logs, list confidential candidate applications, and manipulate enterprise vacancies.
- **Remediation Recommendation:**
  1. Remove all client-side token synthesis (`jwt_session_*`) and hardcoded fallback IDs (`admin_root`, `usr_seeker_77`, `usr_employer_55`).
  2. Implement the Backend-For-Frontend (BFF) proxy pattern: route workspace API mutations through Next.js Route Handlers (`apps/web/src/app/api/...`) where the Next.js server reads the HttpOnly cookie and proxies the request to the NestJS backend with the genuine verified JWT.
  3. Alternatively, if calling the NestJS backend directly from the browser, configure CORS on NestJS with `credentials: true` and pass `credentials: 'include'` in all `fetch()` calls so the browser automatically forwards the session cookie.

---

### Finding 1.2: Phantom `localStorage.getItem('token')` Reads in Institution CMS & Sponsorship
- **Focus Area:** Client-side token storage & retrieval integrity
- **Definitive Status:** `Confirmed Bug`
- **Location:**
  - `apps/web/src/components/workspaces/institution/InstitutionCmsEditor.tsx`, lines 139, 169, 264
  - `apps/web/src/components/workspaces/institution/SponsorshipCard.tsx`, lines 88–96
- **Verbatim Code Snippets:**

*From `InstitutionCmsEditor.tsx` (lines 166–170):*
```typescript
166:   const handleSaveCms = async () => {
167:     setIsSaving(true);
168:     try {
169:       const token = localStorage.getItem('token') || '';
170:       const payload: InstitutionCmsInput = {
```

*From `SponsorshipCard.tsx` (lines 88–96):*
```typescript
88:       const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3001';
89:       const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
90: 
91:       const res = await fetch(`${apiUrl}/institutions/${institutionId}/sponsorship/activate`, {
92:         method: 'POST',
93:         headers: {
94:           'Content-Type': 'application/json',
95:           ...(token ? { Authorization: `Bearer ${token}` } : {}),
96:         },
```

- **Technical Root Cause & Trace:**
  `InstitutionCmsEditor` and `SponsorshipCard` assume authentication tokens are stored in `window.localStorage` under the keys `'token'` or `'access_token'`. However, `apps/web` adheres to modern security standards and never writes authentication tokens to `localStorage`. Legitimate session tokens are exclusively encapsulated within HttpOnly cookies managed by `/api/auth/session`.
  Consequently, `localStorage.getItem('token')` and `localStorage.getItem('access_token')` evaluate to `""` or `null`.
- **User Impact:**
  All institution CMS content saves, admission inquiry status updates, and sponsorship tier activations are dispatched without an `Authorization` header. The backend rejects them with 401 Unauthorized.
- **Remediation Recommendation:**
  Purge all `localStorage.getItem('token')` and `localStorage.getItem('access_token')` references across the codebase. Route these requests through server-side Next.js Route Handlers that extract the verified HttpOnly session cookie, or attach `credentials: 'include'` for cookie-based cross-origin dispatch.

---

### Finding 1.3: Unauthenticated Wallet Recharge Order Creation & Verification
- **Focus Area:** Financial API authentication integrity
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/web/src/components/wallet/RechargeModal.tsx`, lines 112–126, lines 167–177
- **Verbatim Code Snippets:**
```typescript
112:       const orderRes = await fetch(`${apiUrl}/wallet/recharge/create-order`, {
113:         method: 'POST',
114:         headers: {
115:           'Content-Type': 'application/json',
116:         },
117:         body: JSON.stringify({
118:           packId: selectedPack.id,
119:           billingName: billingName || undefined,
120:           billingEmail: billingEmail || undefined,
121:           billingPhone: billingPhone || undefined,
122:           billingAddress: billingAddress || undefined,
123:           billingGstin: billingGstin.trim().toUpperCase() || undefined,
124:         }),
125:       });
...
167:             const verifyRes = await fetch(`${apiUrl}/wallet/recharge/verify`, {
168:               method: 'POST',
169:               headers: {
170:                 'Content-Type': 'application/json',
171:               },
172:               body: JSON.stringify({
173:                 razorpayOrderId: response.razorpay_order_id,
174:                 razorpayPaymentId: response.razorpay_payment_id,
175:                 razorpaySignature: response.razorpay_signature,
176:               }),
177:             });
```
- **Technical Root Cause & Trace:**
  `RechargeModal.tsx` handles Razorpay credit top-ups for employers. In lines 112–126, the modal initiates an order creation request to `${apiUrl}/wallet/recharge/create-order` with only `'Content-Type': 'application/json'`. No `Authorization` header is attached, and no session cookies are transmitted (`credentials: 'include'` is omitted). Similarly, the verification callback in lines 167–177 posts Razorpay payment signatures to `${apiUrl}/wallet/recharge/verify` without authentication.
- **User Impact:**
  The backend cannot associate the payment order or verified Razorpay capture with an authenticated employer account. The backend endpoint either throws a 401 Unauthorized exception (preventing employers from purchasing credits) or creates unassigned, orphaned payment records in the credit ledger.
- **Remediation Recommendation:**
  Route wallet recharge operations through an authenticated Next.js proxy route `/api/wallet/recharge/create-order` and `/api/wallet/recharge/verify` that extracts the authenticated user's ID from the verified HttpOnly session cookie and forwards it to NestJS with an authorized service token.

---

### Finding 1.4: Interactive Role Switcher Modal (`RoleSwitcherModal.tsx`)
- **Focus Area:** Development / debug auth backdoor audit
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `apps/web/src/components/common/RoleSwitcherModal.tsx`, lines 34, 136–139; `apps/web/src/context/AppContext.tsx`, lines 164–170
- **Verbatim Code Snippets:**

*From `RoleSwitcherModal.tsx` (line 34):*
```typescript
34:   if (!isRoleSwitcherOpen || process.env.NODE_ENV === 'production') return null;
```

*From `AppContext.tsx` (lines 164–170):*
```typescript
164:   const loginAs = useCallback(
165:     (_role: ClientRole, _session?: unknown) => {
166:       setIsAuthModalOpen(false);
167:       setIsRoleSwitcherOpen(false);
168:     },
169:     []
170:   );
```
- **Technical Analysis:**
  The audit inspected `RoleSwitcherModal` to determine if development mode role switching could be exploited in production to bypass authentication.
  1. The component contains a strict environment guard at line 34: `if (!isRoleSwitcherOpen || process.env.NODE_ENV === 'production') return null;`. When Next.js compiles production bundles, the dead code eliminator strips this modal entirely from client rendering.
  2. In `AppContext.tsx`, `loginAs` does not synthesize credentials, write cookies, or modify the `user` state. It merely closes modal dialogs.
  3. Real authentication is strictly anchored to `initialSession` (derived server-side from HttpOnly cookies) or `GET /api/auth/session`.
- **Remediation Recommendation:**
  No vulnerability present. Clean up unused `_role` and `_session` parameters in `AppContext.tsx` to maintain codebase hygiene.

---

### Finding 1.5: Legitimate Production Authentication Flow (`AuthModal.tsx` & `/api/auth/session`)
- **Focus Area:** Authentication integrity & session cookie security
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `apps/web/src/components/auth/AuthModal.tsx`, lines 246–285; `apps/web/src/app/api/auth/session/route.ts`, lines 20–89
- **Verbatim Code Snippets:**
```typescript
246:       const verifyRes = await fetch(`${apiBaseUrl}/auth/otp/verify`, {
247:         method: 'POST',
248:         headers: { 'Content-Type': 'application/json' },
249:         body: JSON.stringify({
250:           phone: normalizedPhone,
251:           code,
252:           role: roleCheck.data,
253:           turnstileToken: turnstileToken || undefined,
254:         }),
255:       });
...
276:       const sessionRes = await fetch('/api/auth/session', {
277:         method: 'POST',
278:         credentials: 'include',
279:         headers: { 'Content-Type': 'application/json' },
280:         body: JSON.stringify({ token: verifyData.accessToken }),
281:       });
```
- **Technical Analysis:**
  The production authentication workflow adheres to robust security practices. The client does not generate fake tokens during authentication. `AuthModal` submits user phone numbers and OTP codes to the backend `/auth/otp/verify` endpoint. Upon successful verification, the backend issues a signed JWT, which the client immediately transmits to the Next.js server-side Route Handler `/api/auth/session`. This handler sets a secure, HttpOnly, SameSite=Lax cookie.
- **Remediation Recommendation:**
  No vulnerability present in the primary login flow.

---

```
================================================================================
SECTION 2: UI OPTIMISTIC STATE & FALSE-SUCCESS ERROR HANDLING
================================================================================
```

### Finding 2.1: SponsorshipCard Simulates 1-Year Success Banner on Backend Failure or Network Drop
- **Focus Area:** UI false-positive success feedback & financial integrity
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/web/src/components/workspaces/institution/SponsorshipCard.tsx`, lines 115–137
- **Verbatim Code Snippet:**
```typescript
115:       } else {
116:         // Fallback simulation for client demo
117:         const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
118:         setActiveState(true);
119:         setCurrentTierState(calculation.tier);
120:         setExpiryState(oneYearLater);
121:         setSponsoredCountState(studentCount);
122:         setSuccessBanner(true);
123:         onActivateSuccess?.({
124:           tier: calculation.tier,
125:           totalStudents: studentCount,
126:           expiresAt: oneYearLater,
127:         });
128:       }
129:     } catch {
130:       // Local fallback on network disconnect
131:       const oneYearLater = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
132:       setActiveState(true);
133:       setCurrentTierState(calculation.tier);
134:       setExpiryState(oneYearLater);
135:       setSponsoredCountState(studentCount);
136:       setSuccessBanner(true);
137:     } finally {
```
- **Technical Root Cause & Trace:**
  In `SponsorshipCard.tsx`, an institution administrator can activate bulk candidate sponsorship. When the POST request to `${apiUrl}/institutions/${institutionId}/sponsorship/activate` fails (returns HTTP 400, 401, 500, or drops due to a network error), both the `else` block (line 115) and `catch` block (line 129) intercept the error and execute a simulated demo state. The code synthesizes an expiration timestamp 365 days into the future, sets `setActiveState(true)`, renders `setSuccessBanner(true)`, and triggers the parent component's `onActivateSuccess` callback.
- **User Impact:**
  An institution administrator activating candidate sponsorships is presented with a green success banner declaring: "Sponsorship Active • Valid until Nov 2027 • All 150 students sponsored." In reality, the payment was never processed, the credit ledger was never updated, and the backend database has zero record of the sponsorship. When students log in to apply for jobs, they are not recognized as sponsored and are blocked from applying.
- **Remediation Recommendation:**
  Delete the fallback simulation logic in both `else` and `catch` blocks. If `res.ok` is false or an exception is caught, parse the server's error message, set `setSuccessBanner(false)`, set `setActiveState(false)`, and display an explicit error alert to the administrator.

---

### Finding 2.2: SaveSearchAlertModal Displays False Success Banner on 404/500/Network Drops
- **Focus Area:** UI false-positive success feedback & candidate notification integrity
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/web/src/components/jobs/SaveSearchAlertModal.tsx`, lines 52–76
- **Verbatim Code Snippet:**
```typescript
52:       if (!res.ok) {
53:         // Fall back to client storage if session or mock
54:         localStorage.setItem(
55:           `saved_alert_${Date.now()}`,
56:           JSON.stringify({ title, frequency, filters: { currentKeyword, currentCity, currentCategory } }),
57:         );
58:       }
59: 
60:       setStatus('success');
61:       setTimeout(() => {
62:         setIsOpen(false);
63:         setStatus('idle');
64:       }, 1800);
65:     } catch {
66:       // Local fallback
67:       localStorage.setItem(
68:         `saved_alert_${Date.now()}`,
69:         JSON.stringify({ title, frequency, filters: { currentKeyword, currentCity, currentCategory } }),
70:       );
71:       setStatus('success');
72:       setTimeout(() => {
73:         setIsOpen(false);
74:         setStatus('idle');
75:       }, 1800);
76:     }
```
- **Technical Root Cause & Trace:**
  `SaveSearchAlertModal.tsx` submits job notification subscriptions to `/api/jobs/alerts`. That Next.js Route Handler does not exist, so `fetch()` returns a 404 Not Found error. In lines 52–58, when `!res.ok`, the code dumps the alert into `localStorage` and unconditionally executes `setStatus('success')`. In lines 65–76, if a network exception occurs, it also dumps to `localStorage` and calls `setStatus('success')`. The UI renders the green checkmark banner: "Alert Created Successfully! We will notify you when matching jobs are posted."
- **User Impact:**
  Job seekers believe they have successfully registered for automated email or SMS notifications for vocational vacancies. Because the subscription was dumped into local browser storage rather than the PostgreSQL `job_alerts` table, the backend worker never indexes the alert, and candidates never receive notifications.
- **Remediation Recommendation:**
  Implement the backend `/api/jobs/alerts` endpoint. When `!res.ok` or in `catch`, transition to `setStatus('error')`, display `errorMsg` to the user, and do not close the modal or display success confirmation.

---

### Finding 2.3: Employer Workspace Publishes Fake Vacancy and Toasts Success on Backend Failure
- **Focus Area:** UI false-positive success feedback & vacancy persistence
- **Definitive Status:** `Confirmed Bug`
- **Location:** 
  - `apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts`, lines 96–115
  - `apps/web/src/components/workspaces/employer/employerApi.ts`, lines 81–92
- **Verbatim Code Snippets:**

*From `employerApi.ts` (lines 81–92):*
```typescript
81: export async function postNewJobApi(apiUrl: string, authHeader: string, userId: string, payload: unknown) {
82:   try {
83:     const res = await fetch(`${apiUrl}/jobs`, {
84:       method: 'POST',
85:       headers: { 'Content-Type': 'application/json', Authorization: authHeader, 'x-user-id': userId },
86:       body: JSON.stringify(payload),
87:     });
88:     return res.ok ? await res.json() : null;
89:   } catch {
90:     return null;
91:   }
92: }
```

*From `useEmployerWorkspace.ts` (lines 96–115):*
```typescript
96:     const created = await postNewJobApi(apiUrl, authHeader, userId, validation.data);
97:     const newJob: JobItem = {
98:       id: created?.id || `job-${Date.now()}`,
99:       title: postJobState.title.trim(),
...
111:     setCompanyJobs([newJob, ...companyJobs]);
112:     addToast({ type: 'success', title: 'Vacancy Published Successfully', message: `Position "${newJob.title}" is active.` });
113:     postJobState.setSuccessNotice(`Job posting "${newJob.title}" published successfully.`);
114:     postJobState.resetForm();
115:     setTimeout(() => { setActiveTab('manage-jobs'); postJobState.setSuccessNotice(''); }, 1200);
```
- **Technical Root Cause & Trace:**
  `postNewJobApi` swallows HTTP error statuses and network exceptions, returning `null`. In `handlePostJob`, the code does not check if `created` is null; instead, it synthesizes `id: created?.id || 'job-' + Date.now()`, inserts the fake job into the local React state `companyJobs`, issues a success toast ("Vacancy Published Successfully"), resets the form, and redirects the employer to the `manage-jobs` tab.
- **User Impact:**
  An employer posting a job while unauthenticated, rate-limited, or when the server is down receives affirmative confirmation that their job vacancy is live and active. As soon as the page is reloaded, the job disappears because it was never persisted in PostgreSQL.
- **Remediation Recommendation:**
  Modify `postNewJobApi` to return an explicit error or throw on failure. In `handlePostJob`, check `if (!created || !created.id)`. On failure, render an error toast `addToast({ type: 'error', title: 'Failed to Post Vacancy', message: ... })`, retain form inputs, and do not navigate away.

---

### Finding 2.4: Seeker Workspace Announces "Profile Updated Successfully" When Backend Rejects Save
- **Focus Area:** UI false-positive success feedback & candidate data integrity
- **Definitive Status:** `Confirmed Bug`
- **Location:**
  - `apps/web/src/components/workspaces/seeker/useSeekerWorkspace.ts`, lines 178–217
  - `apps/web/src/components/workspaces/seeker/seekerApi.ts`, lines 108–126
- **Verbatim Code Snippets:**

*From `seekerApi.ts` (lines 108–126):*
```typescript
108:   try {
109:     const res = await fetch(`${apiUrl}/profiles/seeker/me`, { ... });
118:     if (res.ok) {
119:       const saved = await res.json();
120:       return { success: true, completenessScore: saved?.completenessScore };
121:     }
122:   } catch {
123:     // Offline fallback
124:   }
125:   return { success: false };
```

*From `useSeekerWorkspace.ts` (lines 178–217):*
```typescript
178:     const saveResult = await saveSeekerProfile(apiUrl, authHeader, userId, validationResult.data);
179:     const completeness = saveResult.completenessScore ?? 100;
180: 
181:     setProfile({
...
202:       aadhaarLastFour: formData.formAadhaarLastFour,
203:       aadhaarVerified: Boolean(formData.formAadhaarLastFour),
...
206:       completionPercentage: completeness,
207:       isOnboardingComplete: true,
208:     });
209: 
210:     setIsOnboardingComplete(true);
211:     setIsEditing(false);
212:     addToast({
213:       type: 'success',
214:       title: t('toastProfileSaved'),
215:       message: t('toastProfileSavedDesc'),
216:     });
```
- **Technical Root Cause & Trace:**
  `saveSeekerProfile` returns `{ success: false }` whenever the backend returns an error (such as 401 Unauthorized or validation rejection). In `useSeekerWorkspace.ts`, `saveResult.success` is completely ignored. The component calculates `completeness = 100`, updates the local React state, sets `isOnboardingComplete: true`, closes the editing form, and displays a success toast.
  Furthermore, line 203 performs client-side self-certification: `aadhaarVerified: Boolean(formData.formAadhaarLastFour)`. This directly violates PRD Hard Invariant #8, which requires that Aadhaar verification be verified strictly via licensed partners rather than client assertion.
- **User Impact:**
  Job seekers editing their profile believe their educational credentials and preferences have been securely saved. On reload, all edits are lost. Candidates also see their Aadhaar status as "Verified" simply by typing 4 digits into a form.
- **Remediation Recommendation:**
  Verify `if (!saveResult.success) { addToast({ type: 'error', title: t('toastSaveFailed'), message: ... }); return; }`. Keep the form open with input data preserved. Remove client-side self-certification of `aadhaarVerified`.

---

### Finding 2.5: Public Admission Inquiry Simulates Successful Enrollment on Network Failure
- **Focus Area:** UI false-positive success feedback & student lead capture
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/web/src/components/workspaces/institution/PublicInstitutionTabs.tsx`, lines 92–95
- **Verbatim Code Snippet:**
```typescript
92:     } catch {
93:       // Offline fallback: simulate successful capture
94:       setInquirySuccess(true);
95:     } finally {
```
- **Technical Root Cause & Trace:**
  When a prospective student submits an admission inquiry, if the network drops or the server returns an error triggering the `catch` block, the code executes `// Offline fallback: simulate successful capture` and sets `setInquirySuccess(true)`. The component renders: "Your admission inquiry has been received! The institute placement and admissions office will contact you on your mobile number."
- **User Impact:**
  Students seeking vocational education are assured that the training institute will contact them. In reality, the inquiry dropped in the browser and was never transmitted to the institution's CRM or database.
- **Remediation Recommendation:**
  In `catch`, set `setErrorMessage('Network error: Unable to submit inquiry. Please try again.')`, keep `setInquirySuccess(false)`, and preserve form inputs.

---

### Finding 2.6: Institution CMS Editor Inquiry Status Mutation Without Rollback
- **Focus Area:** UI optimistic state rollback failure
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/web/src/components/workspaces/institution/InstitutionCmsEditor.tsx`, lines 180–191, lines 262–279
- **Verbatim Code Snippets:**
```typescript
262:   const handleStatusChange = async (inquiryId: string, newStatus: InquiryStatus) => {
263:     try {
264:       const token = localStorage.getItem('token') || '';
265:       await updateInquiryStatus(apiUrl, token, inquiryId, newStatus);
266:       setInquiries((prev) =>
267:         prev.map((inq) => (inq.id === inquiryId ? { ...inq, status: newStatus } : inq)),
268:       );
269:       addToast({
270:         type: 'success',
271:         title: 'Lead Status Updated',
272:         message: `Inquiry status changed to ${newStatus}.`,
273:       });
274:     } catch {
275:       setInquiries((prev) =>
276:         prev.map((inq) => (inq.id === inquiryId ? { ...inq, status: newStatus } : inq)),
277:       );
278:     }
279:   };
```
- **Technical Root Cause & Trace:**
  When `updateInquiryStatus` fails or throws an exception, the `catch` block (lines 274–278) mutates `setInquiries` to `newStatus` anyway without rolling back to the previous status, and without informing the user that the server rejected the change.
- **User Impact:**
  Admissions staff believe an inquiry's status has transitioned to "admitted" or "contacted". On page refresh, the status reverts or remains out of sync with the database.
- **Remediation Recommendation:**
  Capture previous inquiry state prior to the async call. In `catch`, rollback `setInquiries(previousInquiries)` and issue an error toast: `addToast({ type: 'error', title: 'Update Failed', message: ... })`.

---

### Finding 2.7: Fire-and-Forget Employer Business Profile & Applicant Status Mutations
- **Focus Area:** Unhandled asynchronous errors & missing error feedback
- **Definitive Status:** `Confirmed Bug`
- **Location:**
  - `apps/web/src/components/workspaces/employer/useEmployerWorkspace.ts`, lines 118–139
  - `apps/web/src/components/workspaces/employer/employerApi.ts`, lines 101–108, lines 115–132
- **Verbatim Code Snippets:**

*From `employerApi.ts`:*
```typescript
101:   try {
102:     await fetch(`${apiUrl}/jobs/applications/${appId}/status`, { ... });
107:   } catch {}
...
116:   try {
117:     await fetch(`${apiUrl}/profiles/business/me`, { ... });
131:   } catch {}
```

*From `useEmployerWorkspace.ts`:*
```typescript
133:     const updated = getUpdatedCompany(company);
134:     setCompany(updated);
135:     setIsEditingProfile(false);
136:     setIsOnboardingComplete(true);
137:     updateBusinessProfileApi(apiUrl, authHeader, userId, updated);
138:     addToast({ type: 'success', title: 'Profile Updated Successfully', message: `${updated.name} profile saved.` });
```
- **Technical Root Cause & Trace:**
  `updateBusinessProfileApi` is invoked without `await`. The handler immediately mutates local React state, marks onboarding complete, and toasts success. In `employerApi.ts`, both `updateBusinessProfileApi` and `updateAppStatusApi` swallow all errors in empty `catch {}` blocks without checking `res.ok`.
- **User Impact:**
  Employers are told their business profile and applicant decisions have been saved, even when the server is down or returns a 401 error.
- **Remediation Recommendation:**
  Make `handleSaveProfile` async, `await updateBusinessProfileApi`, check `res.ok`, and only toast success if the server persists the update.

---

### Finding 2.8: MSME Broadcast Console Generates Fake Campaign ID on 404/500 Errors
- **Focus Area:** UI false-positive success feedback & administrative compliance
- **Definitive Status:** `Confirmed Bug`
- **Location:** `apps/web/src/components/workspaces/admin/MsmeBroadcastConsole.tsx`, lines 184–215, lines 235–245
- **Verbatim Code Snippet:**
```typescript
203:         if (response.ok) {
204:           const data = await response.json();
205:           setDispatchSuccessId(data.campaignId || `camp_${Date.now()}`);
206:         } else {
207:           setDispatchSuccessId(`camp_${Date.now()}`);
208:         }
209:       }
210:       setIsModalOpen(false);
211:     } catch {
212:       // Graceful fallback for mock mode
213:       setDispatchSuccessId(`camp_${Date.now()}`);
214:       setIsModalOpen(false);
215:     } finally {
```
- **Technical Root Cause & Trace:**
  The Next.js route `/api/admin/broadcast/dispatch` does not exist in `apps/web`. When `fetch` returns 404 (`!response.ok`) or throws, both `else` and `catch` synthesize a fake campaign ID: `camp_${Date.now()}`. The UI displays the green success banner:
  "Broadcast Dispatched Successfully! Campaign ID: camp_... • Queued to BullMQ broadcast-queue".
- **User Impact:**
  MSME department administrators believe urgent compliance or policy notices have been queued to BullMQ and dispatched to thousands of enterprises when nothing was sent.
- **Remediation Recommendation:**
  Wire the dispatch handler to the real backend broadcast endpoint. When the response is not OK or throws, display an error message and do not set `dispatchSuccessId`.

---

### Finding 2.9: Pure In-Memory Student Enrolment & Profile Save in Institution Workspace
- **Focus Area:** Incomplete feature / mock data store in UI
- **Definitive Status:** `Incomplete Feature`
- **Location:** `apps/web/src/components/workspaces/institution/useInstitutionWorkspace.ts`, lines 242–260, lines 262–330
- **Verbatim Code Snippet:**
```typescript
242:     const newStudent = createQuickStudent(
243:       institution.id,
244:       quickStudentName,
...
250:     setStudents([newStudent, ...students]);
...
255:     addToast({
256:       type: 'success',
257:       title: 'Student Registered',
258:       message: `${newStudent.studentName} enrolled in invited state.`,
259:     });
```
- **Technical Root Cause & Trace:**
  `handleQuickAddStudent` and `handleSaveProfile` execute pure in-memory state mutations without dispatching any HTTP requests to backend endpoints (`/profiles/institution/students` or `/profiles/institution/me`).
- **User Impact:**
  Quick-added students and profile edits disappear immediately upon page reload.
- **Remediation Recommendation:**
  Implement API calls to the backend institution routes, handling loading states and error responses.

---

### Finding 2.10: Missing Next.js BFF Route for Job Promotion (`PromoteJobModal.tsx`)
- **Focus Area:** Incomplete feature & missing proxy route
- **Definitive Status:** `Incomplete Feature`
- **Location:** `apps/web/src/components/workspaces/employer/PromoteJobModal.tsx`, lines 35–59
- **Technical Analysis:**
  `PromoteJobModal` properly checks `!res.ok` and displays error states when the request fails (unlike `SaveSearchAlertModal`). However, the target route `/api/jobs/${jobId}/promote` does not exist in Next.js, resulting in consistent 404 errors.
- **Remediation Recommendation:**
  Create the Next.js API route handler `/api/jobs/[id]/promote/route.ts` that proxies to NestJS with the HttpOnly session token.

---

```
================================================================================
SECTION 3: CROSS-SITE SCRIPTING (XSS) & INJECTION VULNERABILITIES AUDIT
================================================================================
```

### Finding 3.1: Stored XSS via JSON-LD `dangerouslySetInnerHTML` in Public Detail Pages
- **Focus Area:** Stored Cross-Site Scripting (XSS) / Context Premature Termination
- **Definitive Status:** `Confirmed Bug`
- **Location:**
  - `apps/web/src/app/jobs/[id]/page.tsx`, lines 117–120
  - `apps/web/src/app/company/[id]/page.tsx`, lines 121–124
  - `apps/web/src/app/institution/[id]/page.tsx`, lines 251–254
  - `apps/web/src/app/institutions/page.tsx`, lines 156–159
- **Verbatim Code Snippets:**

*From `jobs/[id]/page.tsx` (lines 117–120):*
```tsx
117:       {/* Structured SEO Data for Google Jobs */}
118:       <script
119:         type="application/ld+json"
120:         dangerouslySetInnerHTML={{ __html: JSON.stringify(jobPostingJsonLd) }}
121:       />
```

*From `company/[id]/page.tsx` (lines 121–124):*
```tsx
121:       {/* Structured SEO Data for Google */}
122:       <script
123:         type="application/ld+json"
124:         dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
125:       />
```

*From `institution/[id]/page.tsx` (lines 251–254):*
```tsx
251:       {/* Structured SEO Data for Google */}
252:       <script
253:         type="application/ld+json"
254:         dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
255:       />
```
- **Technical Root Cause & Threat Model:**
  User-controlled fields (`job.title`, `job.description`, `job.companyName`, `company.name`, `institution.institutionName`, `institution.about`) are embedded into inline `<script type="application/ld+json">` elements using `JSON.stringify(...)`.
  Standard `JSON.stringify` does not escape the `<` character or the sequence `</script>`. Under the HTML5 specification (section 13.2.5.7: "Script data state"), when an HTML tokenizer encounters the character sequence `</script`, it terminates the current script element regardless of whether the sequence appears inside a JavaScript or JSON string literal:
  ```html
  <script type="application/ld+json">
  {"@context":"https://schema.org","description":"</script><script>alert(document.domain)</script>"}
  </script>
  ```
  The browser treats the string as terminating the JSON-LD block and immediately executes the subsequent `<script>` tag as live JavaScript in the context of the portal origin.
- **User Impact:**
  An attacker creating a malicious job posting or company profile can inject stored JavaScript that executes in the browser of every visitor, job applicant, or administrator viewing the public page. This allows session theft, credential harvesting, or unauthorized actions on behalf of viewing users.
- **Remediation Recommendation:**
  Sanitize the serialized JSON string by escaping all `<` characters with their Unicode escape sequence `\u003c`:
  ```tsx
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{
      __html: JSON.stringify(jobPostingJsonLd).replace(/</g, '\\u003c'),
    }}
  />
  ```
  JSON and JSON-LD parsers decode `\u003c` as `<` without semantic difference, while preventing HTML tokenizers from recognizing a closing `</script>` tag.

---

### Finding 3.2: Stored DOM XSS via Unvalidated `javascript:` URI in Institution Website Link
- **Focus Area:** Stored DOM Cross-Site Scripting via `javascript:` URI
- **Definitive Status:** `Confirmed Bug`
- **Location:**
  - `apps/web/src/app/institution/[id]/page.tsx`, lines 353–360
  - `packages/validation/src/profiles.ts`, line 111
- **Verbatim Code Snippets:**

*From `institution/[id]/page.tsx` (lines 353–360):*
```tsx
350:                 {institution.website && (
351:                   <div className="pt-2 border-t border-gray-200 flex items-center gap-1.5">
352:                     <Globe className="w-3.5 h-3.5 text-gray-400" />
353:                     <a
354:                       href={institution.website}
355:                       target="_blank"
356:                       rel="noopener noreferrer"
357:                       className="text-brand-orange font-medium hover:underline truncate"
358:                     >
359:                       {institution.website}
360:                     </a>
361:                   </div>
362:                 )}
```

*From `packages/validation/src/profiles.ts` (line 111):*
```typescript
111:   website: z.string().url('Invalid website URL').optional().or(z.literal('')),
```
- **Technical Root Cause & Threat Model:**
  `institution.website` is rendered directly into the `href` attribute of an anchor tag without scheme validation.
  In `packages/validation/src/profiles.ts` (line 111), the validation schema relies on Zod's `z.string().url()`. According to the WHATWG URL Standard, `javascript:alert(1)` is a valid URL with the `javascript:` protocol. Zod accepts this string without error.
  When a user clicks on the institution's official website link, the browser executes the JavaScript payload in the user's active session.
- **User Impact:**
  Students, job seekers, and recruiters reviewing an institution's profile who click on the website link execute attacker-controlled JavaScript within their authenticated session.
- **Remediation Recommendation:**
  1. Enforce strict HTTP/HTTPS protocol validation in `packages/validation/src/profiles.ts`:
     ```typescript
     website: z
       .string()
       .regex(/^https?:\/\//i, 'Website must begin with http:// or https://')
       .optional()
       .or(z.literal(''))
     ```
  2. In the UI component, enforce protocol verification before binding to `href`:
     ```tsx
     const safeWebsite = institution.website && /^https?:\/\//i.test(institution.website)
       ? institution.website
       : null;
     ```

---

### Finding 3.3: Stored DOM XSS via Unvalidated `javascript:` URI in Placement Brochure Download Link
- **Focus Area:** Stored DOM Cross-Site Scripting via `javascript:` URI
- **Definitive Status:** `Confirmed Bug`
- **Location:**
  - `apps/web/src/components/workspaces/institution/InstitutionProfileCard.tsx`, lines 122–131
  - `packages/validation/src/profiles.ts`, line 119
- **Verbatim Code Snippets:**
```tsx
122:               {institution.placementBrochureUrl ? (
123:                 <a
124:                   href={institution.placementBrochureUrl}
125:                   target="_blank"
126:                   rel="noreferrer"
127:                   className="text-teal-700 hover:underline font-medium inline-flex items-center gap-1"
128:                 >
129:                   <span>Download Placement Brochure</span>
130:                   <Download className="w-3 h-3" />
131:                 </a>
```
- **Technical Root Cause & Threat Model:**
  `institution.placementBrochureUrl` is rendered directly into an `href` attribute without scheme validation. Like Finding 3.2, Zod's `z.string().url()` permits `javascript:` URIs.
- **User Impact:**
  Users clicking "Download Placement Brochure" execute arbitrary JavaScript within their active session.
- **Remediation Recommendation:**
  Enforce `^https?://` scheme validation in both the Zod schema (`packages/validation/src/profiles.ts`) and the UI component prior to rendering `href`.

---

### Finding 3.4: Social Video Iframe Embed Whitelisting & Origin Isolation
- **Focus Area:** Iframe injection & DOM XSS
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `apps/web/src/components/social-embed.tsx`, lines 9–19, lines 31–38
- **Verbatim Code Snippets:**
```typescript
9: export function sanitizeUrl(url: string): string {
10:   try {
11:     const parsed = new URL(url);
12:     if (['youtube.com', 'www.youtube.com', 'youtu.be', 'instagram.com', 'www.instagram.com', 'facebook.com', 'www.facebook.com'].includes(parsed.hostname)) {
13:       return parsed.toString();
14:     }
15:     return '';
16:   } catch {
17:     return '';
18:   }
19: }
```
- **Technical Analysis:**
  The `SocialEmbed` component restricts embedded `iframe` elements strictly to an explicit hostname whitelist (`youtube.com`, `instagram.com`, `facebook.com`). Any unknown host, `javascript:`, or malformed URI returns an empty string, and the component renders `null`.
- **Remediation Recommendation:**
  No vulnerability present. Maintain the strict hostname whitelist.

---

### Finding 3.5: Profile QR Code Base64 Data URL Rendering
- **Focus Area:** SVG / image injection
- **Definitive Status:** `Mitigated / Not an Issue`
- **Location:** `apps/web/src/components/common/ProfileQrShareCard.tsx`, lines 57–67, lines 134–140
- **Verbatim Code Snippets:**
```typescript
57:       QRCode.toDataURL(url, {
58:         width: 512,
59:         margin: 2,
60:         color: {
61:           dark: '#0f172a',
62:           light: '#ffffff',
63:         },
64:       })
65:         .then((dataUrl) => {
66:           setQrDataUrl(dataUrl);
67:         })
```
- **Technical Analysis:**
  `QRCode.toDataURL(url)` produces a base64-encoded PNG image (`data:image/png;base64,...`) bound to an `<img src={qrDataUrl} />` tag. No raw SVG markup or executable scripts are injected into the DOM.
- **Remediation Recommendation:**
  No vulnerability present.

---

## 4. Prioritized Remediation Roadmap

The identified vulnerabilities and defects are grouped by priority based on their security severity and transactional impact:

### Priority 0: Immediate Security & Authentication Blockers (Launch Blocking)

1. **Fix Stored XSS in JSON-LD Metadata:**
   - Files: `apps/web/src/app/jobs/[id]/page.tsx`, `company/[id]/page.tsx`, `institution/[id]/page.tsx`, `institutions/page.tsx`
   - Action: Replace all instances of `JSON.stringify(...)` in JSON-LD script blocks with `JSON.stringify(...).replace(/</g, '\\u003c')`.
2. **Fix Stored DOM XSS in URL Bindings:**
   - Files: `packages/validation/src/profiles.ts`, `apps/web/src/app/institution/[id]/page.tsx`, `InstitutionProfileCard.tsx`
   - Action: Update `website` and `placementBrochureUrl` schemas to require `^https?://`. In UI components, add defensive protocol checks before rendering `href`.
3. **Eliminate Client-Side Token Synthesis & Identity Spoofing:**
   - Files: `JobApplyButton.tsx`, `AdminWorkspace.tsx`, `useEmployerWorkspace.ts`, `useSeekerWorkspace.ts`, `useInstitutionWorkspace.ts`, `employerApi.ts`, `seekerApi.ts`
   - Action: Purge all `jwt_session_*` synthesis and hardcoded fallback IDs (`admin_root`, `usr_seeker_77`, `usr_employer_55`). Route requests through Next.js Route Handlers using the verified HttpOnly session cookie.
4. **Purge Phantom LocalStorage Reads & Authenticate Wallet:**
   - Files: `InstitutionCmsEditor.tsx`, `SponsorshipCard.tsx`, `RechargeModal.tsx`
   - Action: Remove `localStorage.getItem('token')` and `localStorage.getItem('access_token')`. Pass credentials or proxy through Next.js Route Handlers.

### Priority 1: Critical UX & Transactional Integrity Fixes

1. **Remove False-Success Fallbacks in Sponsorship & Inquiry Forms:**
   - Files: `SponsorshipCard.tsx`, `PublicInstitutionTabs.tsx`
   - Action: Delete the simulated 1-year activation and fake inquiry success in `else` and `catch` blocks. Render explicit error alerts on failure.
2. **Remove Unconditional Success in Modals:**
   - Files: `SaveSearchAlertModal.tsx`, `MsmeBroadcastConsole.tsx`
   - Action: Do not call `setStatus('success')` or generate fake `camp_...` IDs on 4xx/5xx responses. Display server rejection reasons to users.
3. **Ensure Genuine Server Confirmation Before Toasting Success:**
   - Files: `useEmployerWorkspace.ts`, `useSeekerWorkspace.ts`, `employerApi.ts`
   - Action: Check `res.ok` and `saveResult.success` before updating state or issuing success toasts. Retain form data when requests fail. Remove client self-certification of `aadhaarVerified`.

### Priority 2: Incomplete Feature Completion & BFF Proxying

1. **Connect Institution Quick-Add & Profile Edits to Backend:**
   - File: `useInstitutionWorkspace.ts`
   - Action: Replace pure in-memory state mutations with real API calls to `/profiles/institution/students` and `/profiles/institution/me`.
2. **Implement Missing Next.js BFF Route Handlers:**
   - Routes: `/api/jobs/[id]/promote`, `/api/jobs/alerts`, `/api/admin/broadcast/dispatch`
   - Action: Create Next.js route handlers that forward authenticated requests to NestJS with the server-side JWT.

---

## 5. Verification & Test Execution Guide

All findings can be independently reproduced and verified using the following offline procedures:

### Automated Test Suite Execution

Run the existing test suites across the web application and validation package:
```bash
# Execute web application unit and component tests (13 test files, 120 tests)
pnpm --filter @indian-job-portal/web test

# Execute TypeScript strict type checking
pnpm --filter @indian-job-portal/web typecheck

# Execute validation schema tests
pnpm --filter @indian-job-portal/validation test
```

### Manual Verification Steps for Specific Vulnerabilities

1. **Verify JSON-LD Stored XSS:**
   - Inspect `apps/web/src/app/jobs/[id]/page.tsx:119`. Notice that `JSON.stringify(jobPostingJsonLd)` is passed directly to `dangerouslySetInnerHTML`.
   - Test payload: If `job.description` contains `"</script><script>alert('XSS')</script>"`, the HTML parser will close the script element prematurely and execute the payload.
2. **Verify DOM XSS via `javascript:` URIs:**
   - Inspect `packages/validation/src/profiles.ts:111`.
   - Run in Node REPL:
     ```javascript
     const { z } = require('zod');
     const schema = z.string().url();
     console.log(schema.safeParse('javascript:alert(1)').success); // true
     ```
   - In `apps/web/src/app/institution/[id]/page.tsx:354`, `<a href={institution.website}>` binds this directly without protocol checks.
3. **Verify Client-Side Token Synthesis:**
   - Run grep across the web source:
     ```bash
     rg "jwt_session_" apps/web/src
     ```
   - Notice fallbacks in `JobApplyButton.tsx:63`, `AdminWorkspace.tsx:43`, `useEmployerWorkspace.ts:65`, `useSeekerWorkspace.ts:68, 175`, and `useInstitutionWorkspace.ts:88`.
   - Inspect `apps/web/src/lib/auth-session.ts:131–133` to confirm `jwt_session_*` is explicitly rejected.
4. **Verify UI False Success Simulation:**
   - Inspect `apps/web/src/components/workspaces/institution/SponsorshipCard.tsx:115–128`. Observe the `else` block labeled `// Fallback simulation for client demo` that sets `setActiveState(true)` for 1 year when `!res.ok`.
   - Inspect `apps/web/src/components/jobs/SaveSearchAlertModal.tsx:52–60`. Observe `setStatus('success')` executed inside the `!res.ok` branch.

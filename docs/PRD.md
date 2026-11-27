# **PRODUCT REQUIREMENTS DOCUMENT**

**Job Portal Platform (JP)**

Scope, phases, technology and cost forthe first 50,000 users

| **Item**     | **Detail**                                                                                                                                               |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Version      | 1.3, draft for client review (credit revenue model finalised: 10 free applications confirmed; institution pricing tiered by student count, Section 10.1) |
| Date         | 8 October 2026                                                                                                                                           |
| Prepared by  | Pj                                                                                                                                                       |
| Prepared for | Client team, Job Portal Platform                                                                                                                         |
| Based on     | Client meeting of 21 September 2026 (recording and whiteboard) and Technology, Hosting & Cost Plan v2                                                    |
| Status       | For finalisation: client to answer Section 13 and sign Section 14                                                                                        |

_All amounts are in Indian rupees. Dollar prices are converted at₹88 per US$1. Estimates are for planning and are not quotes; taxes such as GSTare not included._

1. The PRD at a glance
   ======================

This documentturns the client meeting (21 September 2026, whiteboard and recording) and theTechnology, Hosting & Cost Plan v2 into one agreed description of what wewill build, in what order, on which technology, and at what cost. Once theclient signs Section 14, it becomes the reference for the build.

| **Item**                             | **Summary**                                                                                                                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Product                              | **Job Portal Platform (JP)**: one portal that connects Employers (MSMEs and businesses), Intermediaries (universities, colleges, agencies) and Job Seekers (students and individuals).                                                                                   |
| Big idea                             | A centralised, categorised database of MSMEs and students; a single business profile for every enterprise; job posting from blue-collar to white-collar and freelance (“open collar”) work; and a credit wallet so employers and job seekers pay only for what they use. |
| Month-1 target                       | About **50,000 registered users** across employers and job seekers, mostly through bulk onboarding of institutions and the MSME Department database.                                                                                                                     |
| Delivery in phases                   | **MVP** in 3 weeks (₹72,500, as quoted). **Phase 2** growth modules (about ₹87,500). **Phase 3** advanced modules (about ₹97,500). Section 5 and Section 11.                                                                                                             |
| Technology                           | Next.js + TypeScript, Node.js API, PostgreSQL (Supabase), Redis (Upstash), Cloudflare, Vercel, Indian SMS provider. **Docker: yes. Kubernetes: no. Terraform: only if the client picks AWS.** Section 8.                                                                 |
| Monthly running cost at 50,000 users | About **₹38,000** (budget ceiling ₹44,000 with a 15% buffer). About 40% of this is OTP and invitation SMS. Section 9.                                                                                                                                                    |
| What we need from the client         | Answers to the open questions in Section 13, the tick-box decisions in Section 14, service accounts in the client’s name, and SMS (DLT) registration started on day 1.                                                                                                   |

**The one thing to understand about “50,000 users in a month”** The website and servers can handle 50,000 registered users comfortably. The real work is **getting the accounts in**: 50,000 accounts will arrive mostly through bulk uploads from the MSME Department and institutions, which depends on those partners sending data on time. Also, “registered” is not “active”. We will report both numbers (Section 3).
Contents
--------

•     1. The PRD at a glance

•     2. Background and problem

•     3. Goals and success measures

•     4. Users

•     5. Scope and phases

•     6. Functional requirements

•     7. Non-functional requirements

•     8. Technical architecture and infrastructure (incl. 8.7open-source acceleration)

•     9. Cost estimate at 50,000 users

•     10. Revenue model and credits (incl. 10.1 institutionpricing tiers)

•     11. Delivery plan, pricing and payments

•     12. Risks and dependencies

•     13. Open questions for the client

•     14. Acceptance criteria and sign-off

•     Appendix A. What we heard and where it is covered

•     Appendix B. Glossary

2. Background and problem
   =========================

The clientwants a job portal for India, starting in Madhya Pradesh, that works for thewhole hiring chain and not only for large companies. The meeting identifiedproblems on four sides.
2.1 The MSME Department
-----------------------

•     No single, centralised database of enterprises.

•     No built-in way to send bulk SMS, messages or pushnotifications to business owners.

•     Records say Micro, Small or Medium, but not theownership structure (Proprietorship, Private Limited, LLP, Public Limited,registered or unregistered). This makes scheme and incentive eligibility hardto decide.
2.2 Business owners
-------------------

•     Owners maintain separate presences on Instagram,Facebook, Google Business, YouTube and their own websites, each with its ownlimits.

•     They need one clean, shareable business profile (with aQR code), one place to control their integrations, and an easy way to postjobs.
2.3 Universities, colleges and agencies
---------------------------------------

•     Struggle to run a public website and a workingplacement (HR) cell at the same time; many have low staff bandwidth.

•     In the state-level research, an existing competitor’stie-ups cover only the technical education sector. Non-technical highereducation (BA, MA, B.Com, MBA and similar), which the client estimates to beabout four times larger in student numbers, and the Ayush and allied healthcolleges appear untapped.
2.4 Job seekers
---------------

•     Students often need short-term work (typing, accountinghelp, event volunteering) as much as full-time jobs, and no mainstream portalserves this well.

•     Existing portals charge employers roughly ₹1,000 to₹10,000 a month (₹1 lakh to ₹1.5 lakh a year) to post jobs and see contactdetails, and monetise students through courses and resume services.
2.5 Opportunity
---------------

A portal thatstarts from **institutions and the MSME Department** (bulk, trusted data),gives every party a **useful free baseline**, and earns from **credits,sponsorship and a small fee on freelance work** can differentiate itself fromjob boards that charge employers heavily.

3. Goals and success measures
   =============================

3.1 Goals
---------

•     **G1.** Onboard about 50,000 users in month 1(employers, agencies and job seekers) without service slowdowns.

•     **G2.** Give every MSME a single professionalbusiness profile and the ability to post jobs in minutes.

•     **G3.** Give every institution a placement dashboardand a public page with no developer needed (Phase 2).

•     **G4.** Protect user privacy: phone numbers are notshown to employers; every search and contact is logged.

•     **G5.** Keep the running cost low and predictable(Section 9), with spend alerts and OTP abuse protection.
3.2 Success measures
--------------------

_Targetsmarked “proposed” are our suggestions for the client to confirm or change._

| **Measure**                 | **Definition**                                                | **Target**                                              |
| --------------------------- | ------------------------------------------------------------- | ------------------------------------------------------- |
| Registered accounts         | All accounts created, including bulk-imported and invited     | 50,000 by day 30 after launch (client target)           |
| Activated accounts          | Accounts where the person completed OTP login at least once   | Proposed: at least 40% of registered accounts by day 30 |
| Profile completion          | Job seekers with a profile above a minimum completeness score | Proposed: 60% of activated job seekers                  |
| Jobs posted                 | Live jobs created by employers and the MSME Department        | Client to set; we will report weekly                    |
| Applications per job        | Average applications on jobs older than 7 days                | Reported weekly                                         |
| Public page speed           | Job list and company pages on a typical 4G phone              | Proposed: loads in under 2 seconds                      |
| OTP cost per activated user | SMS spend divided by activated accounts                       | Proposed: under ₹0.60                                   |

4. Users
   ========

| **User type**          | **Who they are**                                                                                                                | **What they need most**                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Employer               | MSMEs and other businesses, including business owners who want a profile and to post jobs.                                      | A single business profile with QR code, quick job posting, applicants list, credits for viewing or contacting candidates.                   |
| Intermediary           | Universities, colleges, schools and hiring or placement agencies. Their HR or placement cell is the working user.               | Bulk student onboarding, a placement dashboard, one-click sharing of candidate profiles and brochures, a public institution page (Phase 2). |
| Job seeker: Student    | A student linked to an institution. Usually created in bulk by the institution, then completes the profile through an OTP link. | A free baseline, an easy profile, a premium PDF, jobs and short-term work near them.                                                        |
| Job seeker: Individual | A person who registers on their own (direct B2C).                                                                               | Fast sign-up, job search and apply, free baseline credits.                                                                                  |
| MSME Department admin  | Government department staff who hold the enterprise database.                                                                   | Bulk import of enterprises, categorisation, broadcast messages, reports (Phase 2), scheme and hiring-compliance tools (Phase 3).            |
| Platform admin         | Our team and the client’s operations team.                                                                                      | User and job management, abuse handling, reports, audit log.                                                                                |

4.1 Job categories (“collars”)
------------------------------

Every job andevery job-seeker preference is tagged with one of four categories: **Bluecollar**, **White collar**, **Grey collar** and **Open collar** (freelance and gig work, called “Job Work” in Phase 3). The category drivessearch filters, pricing and matching.

5. Scope and phases
   ===================

The meetingcovered far more than a 3-week MVP can hold. To launch quickly and stillprotect the vision, we propose four labels. Every requirement in Section 6carries one of them.

| **Label** | **Meaning**                                                                                                                                                                         | **Price basis**                              |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **MVP**   | The first launch package: what the client has already been quoted, plus the items needed to reach the 50,000-user goal (bulk onboarding, business profile, jobs, PDF, basic admin). | ₹72,500, 3 weeks (as quoted)                 |
| **Full**  | Extra items in the quoted Full version: complete resume builder, social media embeds, full admin with reports, more polish and testing.                                             | ₹1,15,000 in total, 5 to 6 weeks (as quoted) |
| **P2**    | Phase 2, growth modules from the meeting: credit wallet, institution pages, placement dashboard, MSME broadcast and reports, agency tools.                                          | About ₹87,500 (estimate, Section 11)         |
| **P3**    | Phase 3, advanced modules from the meeting: nearby matching by GPS, Job Work marketplace, custom domains, scheme and hiring-compliance tools.                                       | About ₹97,500 (estimate, Section 11)         |

**Our recommendation** **Build the MVP now, and design its database so P2 and P3 fit without rework.** Bulk onboarding is in the MVP because it is what brings in the first 50,000 users. The credit wallet and the institution dashboard follow immediately as Phase 2, because they are what makes the institutions and the revenue model work. GPS matching and Job Work come in Phase 3, once real usage shows how people behave.
5.1 Out of scope for now
------------------------

•     Native Android and iOS apps. The website is builtmobile-first; a mobile app can be a later phase.

•     WhatsApp Business API messaging. One-click sharingthrough WhatsApp links is planned (Phase 2); official API messaging is aseparate decision and cost.

•     Online courses, exam-preparation kits and consultationpackages.

•     Video interviews, employer background verification andresume parsing with AI.

•     Automated GST filing and audit reminders (listed as“later” in the meeting; P3 only for simple reminders).

6. Functional requirements
   ==========================

**Priority:** Must = launch cannot happen without it. Should = important, can slip within itsphase if time runs out. Could = nice to have. **Phase** uses the labels fromSection 5.
6.1 Accounts and access (AUTH)
------------------------------

| **ID**  | **Requirement**                                                                                                                                                         | **Priority** | **Phase**                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------------------------- |
| AUTH-01 | Sign up and log in with mobile number and OTP. No passwords.                                                                                                            | Must         | MVP                         |
| AUTH-02 | Four account roles: Employer, Intermediary (university, college, agency), Job Seeker (student or individual) and Admin. MSME Department admin is a special admin role.  | Must         | MVP                         |
| AUTH-03 | OTP abuse protection: limit requests per number, device and network; cool-down between requests; daily cap; bot challenge (Cloudflare Turnstile) before an OTP is sent. | Must         | MVP                         |
| AUTH-04 | Users can add and verify an email address as a second contact.                                                                                                          | Should       | MVP                         |
| AUTH-05 | Role-based access on every request. A user sees only their own data unless the platform explicitly allows more.                                                         | Must         | MVP                         |
| AUTH-06 | Long-lived login on mobile browsers, with “sign out of all devices”.                                                                                                    | Should       | MVP                         |
| AUTH-07 | English and Hindi interface.                                                                                                                                            | Should       | P2 (decision in Section 13) |

6.2 Job seeker profile (JS)
---------------------------

| **ID** | **Requirement**                                                                                                                                                | **Priority** | **Phase**                 |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------- |
| JS-01  | Two job seeker types: Student (linked to an institution) and Individual.                                                                                       | Must         | MVP                       |
| JS-02  | Profile with name, photo, education, skills (tags), experience, languages, preferred job categories and location.                                              | Must         | MVP                       |
| JS-03  | Premium designed profile PDF with clickable links, created on one click.                                                                                       | Must         | MVP                       |
| JS-04  | Complete resume builder with templates.                                                                                                                        | Should       | Full                      |
| JS-05  | Privacy: the phone number and email are never shown to employers. Employers reach a candidate through a platform message (or credits, once the wallet exists). | Must         | MVP                       |
| JS-06  | Optional APAAR ID field.                                                                                                                                       | Should       | MVP                       |
| JS-07  | Aadhaar number handling. We recommend **not** storing the full number (see Section 13, decision D3).                                                           | Decision     | To be confirmed           |
| JS-08  | Skill tags include short-term skills (for example Tally, Hindi typing, web development) so that students can be matched to Job Work.                           | Should       | MVP (tags), P3 (matching) |

6.3 Employer and business profile (EMP)
---------------------------------------

| **ID** | **Requirement**                                                                                                                                                                                        | **Priority** | **Phase** |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------- |
| EMP-01 | Business profile: name, ownership type (Proprietorship, Private Limited, LLP, Public Limited, registered or unregistered), size (Micro, Small, Medium), sector, address, contact, about, logo, photos. | Must         | MVP       |
| EMP-02 | Public company page with a clean link that Google can find, and the same look for every business.                                                                                                      | Must         | MVP       |
| EMP-03 | Downloadable QR code for the business profile.                                                                                                                                                         | Should       | MVP       |
| EMP-04 | Embed social media posts (Instagram, Facebook, YouTube) on the company page.                                                                                                                           | Should       | Full      |
| EMP-05 | One dashboard to control the profile, jobs, applicants and (later) credits.                                                                                                                            | Must         | MVP       |
| EMP-06 | Guided window to set up a business email if the owner has none.                                                                                                                                        | Could        | P3        |
| EMP-07 | Simple reminders for audit and GST dates.                                                                                                                                                              | Could        | P3        |

6.4 Jobs (JOB)
--------------

| **ID** | **Requirement**                                                                                                                                   | **Priority** | **Phase** |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| JOB-01 | Create a job: title, description, category (blue, white, grey, open), pay range, location, openings, skills, expiry date.                         | Must         | MVP       |
| JOB-02 | Search and filters: keyword, city, category, pay, experience, date posted. Fast, with results that Google can index (JobPosting structured data). | Must         | MVP       |
| JOB-03 | One-click apply from the profile. The employer sees applicants and can shortlist or reject. The job seeker sees the status.                       | Must         | MVP       |
| JOB-04 | Moderation: admin can approve, hide or remove jobs; users can report a job.                                                                       | Should       | MVP       |
| JOB-05 | Featured or promoted job listings shown at the top.                                                                                               | Could        | P2        |
| JOB-06 | Job alerts by email, SMS or push for saved searches.                                                                                              | Could        | P2        |

6.5 Bulk onboarding (BULK)
--------------------------

This modulebrings in most of the 50,000 users, so it is treated as a core MVP feature.

| **ID**  | **Requirement**                                                                                                                                                                                                       | **Priority** | **Phase** |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| BULK-01 | Upload a CSV or Excel file of students or employers, using a downloadable template.                                                                                                                                   | Must         | MVP       |
| BULK-02 | Row checks: mobile number format, duplicates (inside the file and against existing accounts), missing fields. A downloadable error report shows what to fix.                                                          | Must         | MVP       |
| BULK-03 | Imported people are created in an “invited” state. **No SMS is sent at import.** The invitation link is sent later in controlled batches, with the SMS cost shown before sending. The person finishes with OTP login. | Must         | MVP       |
| BULK-04 | Files of at least 50,000 rows are processed in the background with a progress bar and safe retry, without slowing the public site.                                                                                    | Must         | MVP       |
| BULK-05 | Every imported record keeps its source (for example the MSME Department or a named college).                                                                                                                          | Must         | MVP       |
| BULK-06 | Our team can upload on behalf of an institution, for the on-ground onboarding the meeting described (visiting colleges, collecting raw data, formatting it, uploading it).                                            | Should       | MVP       |

6.6 Intermediaries: universities, colleges, agencies (INT)
----------------------------------------------------------

| **ID** | **Requirement**                                                                                                                                                                                                                 | **Priority** | **Phase** |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| INT-01 | Institution profile: name, type, affiliation, address, logo, contact person.                                                                                                                                                    | Must         | MVP       |
| INT-02 | Public institution page with the same standard tabs for every institution (Courses, Subjects, Fee Structure, Inquiry Form, Departments, Deans and faculty). Editable by non-technical staff, including pasting AI-written text. | Should       | P2        |
| INT-03 | Inquiry form on the institution page; enquiries land in the institution’s dashboard.                                                                                                                                            | Should       | P2        |
| INT-04 | Placement (HR) cell dashboard: student list with filters, incoming employer enquiries, and one-click sharing of candidate profiles or brochures by WhatsApp link or email.                                                      | Must         | P2        |
| INT-05 | Mark students as “sponsored” when the institution pays (Section 10), so their credits are covered.                                                                                                                              | Must         | P2        |
| INT-06 | Agency tools: manage candidate lists and submit profiles to employers.                                                                                                                                                          | Should       | P2        |
| INT-07 | Institution page on the institution’s own domain.                                                                                                                                                                               | Could        | P3        |

6.7 MSME Department console (MSME)
----------------------------------

| **ID**  | **Requirement**                                                                                                                                                                                | **Priority** | **Phase** |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| MSME-01 | Department admin role that can import the enterprise database using the bulk tool (BULK-01 to BULK-05).                                                                                        | Must         | MVP       |
| MSME-02 | Classification fields on every enterprise: ownership structure and size, so records can be filtered and grouped.                                                                               | Must         | MVP       |
| MSME-03 | Broadcast to selected businesses by SMS, push or email, with filters and a cost preview.                                                                                                       | Must         | P2        |
| MSME-04 | Reports: enterprises onboarded, jobs posted, applications and hires, by district and category.                                                                                                 | Should       | P2        |
| MSME-05 | Scheme and startup-incentive eligibility flags, using rules supplied by the department.                                                                                                        | Could        | P3        |
| MSME-06 | Hiring-compliance tracking: businesses that receive subsidies, grants or loans through the department must hire a set number of local candidates through the portal. Progress is tracked here. | Could        | P3        |

6.8 Credit wallet (WAL)
-----------------------

_The MVPdatabase includes the tables for credits so the wallet can be switched on inPhase 2 without reworking data._

| **ID** | **Requirement**                                                                                                                                                                                                                                                      | **Priority** | **Phase**      |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------- |
| WAL-01 | Ledger: every credit granted or used is recorded with who, what and when. Balances are always calculated from the ledger.                                                                                                                                            | Must         | P2             |
| WAL-02 | Starter credits at sign-up. **Confirmed: 10 free job applications per job seeker** (student or individual) before credits are needed. Other action costs (for example employer contact views) remain admin-configurable — see Section 10.1.                          | Must         | P2             |
| WAL-03 | Recharge through a payment gateway (UPI, cards, net banking) with an automatic invoice.                                                                                                                                                                              | Must         | P2             |
| WAL-04 | Admin can set how many credits each action costs, and which institution pricing tier (Section 10.1) applies to a given institution.                                                                                                                                  | Must         | P2             |
| WAL-05 | Institution sponsorship: an **annual per-student fee**, tiered by the institution’s student count (Section 10.1), paid by the institution and covering those students’ credits. No separate onboarding fee — the per-student fee is the only charge to institutions. | Must         | P2             |
| WAL-06 | Refund and credit-expiry policy.                                                                                                                                                                                                                                     | Decision     | Section 13, D6 |

6.9 Nearby matching by location (GEO)
-------------------------------------

The meetingdescribed a “node” model. Every business and every candidate has a **node**:a point of registration (POR, GPS location) and an area of working (AOW, forexample Ujjain or Indore). A student’s node starts at their institution and canbe updated as they move.

| **ID** | **Requirement**                                                                                             | **Priority** | **Phase** |
| ------ | ----------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| GEO-01 | Business node created at onboarding from its registration location and working area.                        | Must         | P3        |
| GEO-02 | Candidate node starts at the institution; the candidate can update their current location and working area. | Must         | P3        |
| GEO-03 | Radius search (for example 20 km) with a map view of available candidate nodes.                             | Must         | P3        |
| GEO-04 | Intimation: an employer sends an in-platform notification to matched candidates. Phone numbers stay hidden. | Must         | P3        |
| GEO-05 | Candidates can search nearby businesses within a radius and “pin” or contact them.                          | Should       | P3        |
| GEO-06 | Every search, notification and interaction is written to the audit trail.                                   | Must         | P3        |

_Until Phase3, the MVP already filters jobs and people by city and district, which coversmost needs at launch._
6.10 Job Work: temporary and freelance tasks (JW)
-------------------------------------------------

Job Work isshort, task-based work, unlike a permanent “Job Creation”. Examples from themeeting: typing 10 pages in Hindi, one month of company accounting for ₹2,000to ₹5,000, or event volunteering for NGOs at ₹200 a day.

| **ID** | **Requirement**                                                                                                                            | **Priority** | **Phase** |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | --------- |
| JW-01  | Business owners or NGOs post a task: description, skill tags, pay, duration, location.                                                     | Must         | P3        |
| JW-02  | Nearby students with matching skill tags are notified; the first to accept gets the task.                                                  | Must         | P3        |
| JW-03  | Task status: Posted, Accepted, In progress, Completed, Paid.                                                                               | Must         | P3        |
| JW-04  | Platform service fee on each paid task (10% was the example). How money is held and released depends on the payment partner (decision D7). | Must         | P3        |

6.11 Admin and audit (ADM)
--------------------------

| **ID** | **Requirement**                                                                                                        | **Priority** | **Phase** |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------------ | --------- |
| ADM-01 | Basic admin: view and disable users, jobs and institutions; handle abuse reports; see imports.                         | Must         | MVP       |
| ADM-02 | Full admin with reports: sign-ups, jobs, applications, imports, OTP and SMS spend.                                     | Should       | Full      |
| ADM-03 | Audit log for sensitive actions: admin logins, bulk imports, data exports, credit changes. Cannot be edited by admins. | Must         | MVP       |
| ADM-04 | Data exports are limited to admin roles and are logged.                                                                | Must         | MVP       |
| ADM-05 | SMS and OTP spend view with alert when a daily limit is reached.                                                       | Should       | MVP       |

6.12 Notifications (NOT)
------------------------

| **ID** | **Requirement**                                                                            | **Priority** | **Phase** |
| ------ | ------------------------------------------------------------------------------------------ | ------------ | --------- |
| NOT-01 | SMS for OTP and invitations through an Indian provider, with DLT-registered templates.     | Must         | MVP       |
| NOT-02 | Transactional email through Resend: welcome, application received, job status, invitation. | Must         | MVP       |
| NOT-03 | In-app notification centre.                                                                | Should       | MVP       |
| NOT-04 | Web push notifications (also used for “intimations” in Phase 3).                           | Could        | P3        |

7. Non-functional requirements
   ==============================

_Targetsmarked “proposed” are chosen for a 50,000-user launch and will be tested beforego-live._

| **Area**          | **Requirement**                                                                                                                                                                                                                                                                                    | **How we check it**                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Speed             | Public job and company pages load in under 2 seconds on a typical 4G phone. Common actions answer in under 0.5 seconds for 95% of requests (proposed).                                                                                                                                             | Speed tests and load test before launch       |
| Capacity          | Designed and tested for 2,000 people using the site at the same time, which is 4% of 50,000 and a cautious estimate (proposed). Bursts on a viral day are absorbed by caching (Section 8.3).                                                                                                       | Load test at 2× the target                    |
| Bulk import       | A 50,000-row file is imported in under 30 minutes while the public site stays fast (proposed).                                                                                                                                                                                                     | Import test with a 50,000-row sample file     |
| Availability      | Target 99.5% monthly uptime, using managed services. This is a target, not a guarantee.                                                                                                                                                                                                            | Uptime monitor and alerts                     |
| Security          | HTTPS everywhere; data encrypted at rest; role-based access enforced in the API and again in the database (row-level security); secrets kept out of the code; rate limits; dependency scanning; admin actions logged.                                                                              | Security checklist and review before launch   |
| Privacy           | Follows the principles of India’s Digital Personal Data Protection Act, 2023: clear consent at sign-up, collect only what is needed, purpose stated, deletion on request, privacy policy and terms. Phone numbers are not exposed. The client’s legal adviser should review the final policy text. | Consent screens, deletion flow, policy review |
| Backups           | Automated daily database backups. A restore is tested once before launch.                                                                                                                                                                                                                          | Restore drill                                 |
| Devices           | Mobile-first. Works on low-cost Android phones and slow networks; current versions of Chrome, Safari, Edge and Firefox.                                                                                                                                                                            | Device tests                                  |
| Accessibility     | Readable font sizes, sufficient colour contrast, labelled form fields, usable with a keyboard.                                                                                                                                                                                                     | Manual check of core pages                    |
| Search visibility | Job and company pages are server-rendered with structured data so Google can index them.                                                                                                                                                                                                           | SEO check                                     |
| Monitoring        | Sentry error tracking, uptime checks, and spend alerts on hosting and SMS.                                                                                                                                                                                                                         | Alerts tested                                 |

8. Technical architecture andinfrastructure
   ===========================================

This sectionbuilds on the Technology, Hosting & Cost Plan v2 already shared with theclient and does not change its choices. It adds what a 50,000-user month needs.
8.1 The stack
-------------

| **Layer**               | **Choice**                                                                      | **Role in the platform**                                                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Website                 | Next.js, TypeScript, Tailwind CSS on Vercel                                     | All pages. Job and company pages are prepared on the server so they load fast and appear in Google.                                                                                                                                                 |
| API (business rules)    | **NestJS on the Fastify adapter**, in a container                               | Login, permissions, jobs, applications, wallet, matching rules. NestJS gives the API a consistent module/guard/interceptor structure as it grows across phases; Fastify gives it the request throughput the capacity targets in Section 7 call for. |
| Worker                  | Plain Node.js with BullMQ, separate container (no HTTP framework needed)        | Long tasks: bulk imports, invitation batches, premium PDF creation, later broadcasts. Kept framework-free since it has no web-facing routes.                                                                                                        |
| Database and files      | PostgreSQL on Supabase (with the PostGIS add-on from Phase 3), Supabase Storage | All records, resumes, logos and PDFs. Row-level security as a second lock.                                                                                                                                                                          |
| Cache and queue         | Redis on Upstash                                                                | Keeps popular pages ready, limits OTP requests, and runs the job queue for the worker.                                                                                                                                                              |
| Search                  | PostgreSQL full-text search                                                     | Enough at launch. Meilisearch is added only if search becomes slow.                                                                                                                                                                                 |
| Protection and delivery | Cloudflare (free plan) with Turnstile                                           | Blocks bots before they reach the site and speeds up delivery.                                                                                                                                                                                      |
| SMS                     | Indian provider such as MSG91                                                   | OTP and invitations at about ₹0.15 to ₹0.30 per message, including DLT.                                                                                                                                                                             |
| Email                   | Resend Pro                                                                      | Automatic emails without a daily limit.                                                                                                                                                                                                             |
| Errors and uptime       | Sentry Team plan                                                                | Records what broke for a user so it can be fixed quickly.                                                                                                                                                                                           |
| Payments (Phase 2)      | An Indian payment gateway such as Razorpay                                      | Wallet recharge and, in Phase 3, task payments. Charged as a percentage per transaction.                                                                                                                                                            |

**Backend framework: NestJS on the Fastify adapter** The Cost Plan originally left this as Node.js with Express or NestJS. We recommend **NestJS running on Fastify** (`@nestjs/platform-fastify`, Nest’s own officially supported adapter, not a community add-on): Fastify measures roughly twice Express’s throughput in typical benchmarks, which supports the capacity target in Section 7, while NestJS’s module, guard and interceptor structure keeps the growing set of roles (platform, MSME, institution admin) and the audit-logging requirement (ADM-03) organised as P2 and P3 add more of the system. Two small, known adjustments come with this pairing: file uploads use `@fastify/multipart` in place of the Express-oriented `multer`, and request validation uses `nestjs-zod` so the same zod schema validates a form in the browser and the matching request on the server (Section 8.7). The worker (bulk import, PDF, SMS) has no web routes, so it stays plain Node.js with BullMQ rather than carrying a web framework it does not need.
8.2 How a request flows
-----------------------

| **Step** | **What happens**                                                                                                                    |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1        | A visitor opens the portal. **Cloudflare** filters bad traffic and serves cached pages.                                             |
| 2        | **Vercel** delivers the page. Public job and company pages come from a ready-made copy, so the database is not touched.             |
| 3        | For actions (log in, apply, upload), the site calls the **API container**.                                                          |
| 4        | The API checks permissions, reads or writes **Supabase**, and uses **Upstash** for limits and cache.                                |
| 5        | Heavy tasks (a 50,000-row import, a PDF) are placed on a **queue**. The **worker container** picks them up, so the site stays fast. |
| 6        | The API or worker asks the **SMS provider** or **Resend** to send messages. **Sentry** records any error.                           |

8.3 Docker, Kubernetes and Terraform: what we use and why
---------------------------------------------------------

The clientasked us to include these only if the MVP needs them. Our decision:

| **Tool**                   | **Decision for the MVP**                                                                     | **Why**                                                                                                                                                                                                                                                                                                                                                 | **When we would revisit**                                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Docker**                 | **Yes, use it.**                                                                             | The API and worker run as containers. This gives the same environment on a laptop, staging and production, and it packages the PDF engine (a headless browser) and the bulk-import worker reliably. A `docker compose` file lets any developer start the whole system locally. The same containers move to AWS unchanged.                               | Not applicable. This is the baseline.                                                                                                                                               |
| **Kubernetes**             | **No, not needed.**                                                                          | A managed container host (Railway or Render) scales a handful of containers on its own. Kubernetes needs a dedicated DevOps person and adds a monthly control-plane fee (on AWS, about $73 or ₹6,400 before any servers). At 50,000 registered users, with a few thousand people online at once, it adds cost and risk without adding capacity we need. | Sustained load beyond what a few containers can serve, many separate services, multiple regions, or a client IT policy that requires it. Realistically a Phase 3 or later question. |
| **Terraform**              | **Not for the recommended stack (Option A). Yes if the client chooses AWS (Option B or C).** | With Option A the accounts are a few managed services set up through their dashboards; Terraform gives little there. On AWS there are dozens of resources (network, database, servers, firewall) and Terraform lets us recreate or change them safely and keep a record of every change.                                                                | At the start of any AWS move, and optionally in Phase 2 to keep Cloudflare DNS and rules as code.                                                                                   |
| **CI/CD** (GitHub Actions) | **Yes.**                                                                                     | Each change is tested automatically, built into a container, deployed to staging, and moved to production after an approval click. This is the main protection against launch-week mistakes.                                                                                                                                                            | Not applicable.                                                                                                                                                                     |

Dockerpackaging, the local set-up and the CI/CD pipeline are part of the MVP build.If the client picks AWS, the extra build effort in the Cost Plan applies(+₹6,000 to ₹7,500 for Option B, +₹12,500 to ₹15,000 for Option C), andTerraform is part of that.
8.4 Getting ready for 50,000 users
----------------------------------

| **Pressure point**     | **Why it appears**                                                  | **How we handle it**                                                                                                       |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| OTP flood and SMS cost | Thousands of sign-ups; bots try to run up the SMS bill              | Turnstile challenge, limits per number and device, daily cap with alert, OTP only at sign-up and login                     |
| Bulk import            | A single file may hold 50,000 rows                                  | Background worker in batches of a few hundred rows, safe retry, progress bar, invitations sent later in controlled batches |
| Database connections   | Many people acting at once                                          | Connection pooling, indexes on search and filter fields, cached public lists                                               |
| Search speed           | 50,000 profiles plus jobs                                           | PostgreSQL full-text search with indexes; Meilisearch only if measured slow                                                |
| PDF spikes             | Many students download at once (for example after a college notice) | Queue with a cap on simultaneous PDFs; each PDF is stored and reused until the profile changes                             |
| Email limits           | Free email plans stop at 100 a day                                  | Resend Pro from day 1                                                                                                      |
| Viral traffic          | One popular job link                                                | Cloudflare and Vercel cache public pages; worker and API scale by adding containers                                        |
| Cost surprises         | Usage-based bills                                                   | Spend alerts on Vercel, hosting and SMS; monthly review for 3 months                                                       |

8.5 Environments and delivery
-----------------------------

•     **Three environments:** local (Docker), staging (acopy for client review), production.

•     **Client-owned accounts:** all service accounts areopened in the client’s name; we are added as team members (as in the CostPlan).

•     **Launch readiness (recommended add-on, Section 11):** load test at twice the target, backup restore drill, spend and error alerts,security checklist.
8.6 Core data (overview)
------------------------

Main records:User and Role, Job Seeker Profile, Institution, Business, Job, Application,Bulk Import Batch, Invitation, Notification and Audit Log. Prepared in the MVPfor later phases: Credit Ledger and Payment (P2), Location Node and Search Log(P3), Task (Job Work) (P3). Every record keeps its source, created and updatedtimes, and who changed it.
8.7 Open-source acceleration: what we reuse instead of building fromscratch
---------------------------------------------------------------------------

To protect the3-week MVP timeline, commodity pieces (file import UI, PDF rendering, adminCRUD, bot protection) are built on proven, permissively licensed(MIT/Apache-2.0) open-source components rather than written from zero. Thiskeeps our time on what is actually specific to this platform: collars, thecredit ledger, node matching and MSME classification.

### 8.7.1 Components used per module

| **PRD module**                     | **Component**                                                                                                                                         | **Role**                                                                                               | **Note**                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AUTH                               | **Supabase native phone/OTP auth**, with a custom SMS hook pointing at the SMS provider                                                               | Sign-up and login (AUTH-01)                                                                            | Preferred over a hand-built OTP service: since the database is already Supabase, this removes an entire subsystem (OTP generation, storage, expiry, verification) that would otherwise be built and secured separately.                                                                                                                                                                    |
| AUTH                               | `@upstash/ratelimit` (official library) with `@marsidev/react-turnstile`                                                                              | OTP request limits and bot challenge (AUTH-03)                                                         | Standard rate-limit patterns (e.g. 3 requests per number per 10 minutes) in a few lines, instead of a hand-rolled Redis limiter.                                                                                                                                                                                                                                                           |
| Multi-tenant routing               | `vercel/platforms` (reference only)                                                                                                                   | Pattern for company and institution page URLs, subdomain and wildcard routing                          | Used as an architecture reference for the routing layer, not forked wholesale. Its Prisma/PlanetScale base is replaced by the Supabase client and RLS from the start, since re-platforming an existing ORM mid-build is slower than building the routing pattern directly on our own stack.                                                                                                |
| UI components                      | shadcn/ui (+ the Taxonomy example app as a reference)                                                                                                 | Accessible Tailwind components: forms, tables, modals, badges, status chips                            | Collar badges (Blue/White/Grey/Open) and application-status chips are assembled from this library rather than styled from scratch.                                                                                                                                                                                                                                                         |
| Bulk import (BULK module)          | `BullMQ` on Upstash Redis; Node `csv-parse` (streaming) for server-side parsing; the `csv-import` React component (MIT) for the column-mapping screen | 50,000-row queued import pipeline (BULK-01 to BULK-04)                                                 | The `csv-import` component is used for its mapping UI only; its full self-hosted backend (a separate Go service) is not deployed. Parsing and validation stay inside our own worker so the bulk pipeline has one codebase, not two. Given BULK-01 already defines a fixed template, a simple upload plus this mapping UI is enough; a fully dynamic column-mapper is not required for MVP. |
| Bulk import (BULK module)          | `bull-board`                                                                                                                                          | Web dashboard over the import and SMS queues                                                           | Lets us see stuck or failed jobs during the launch week without querying the database directly.                                                                                                                                                                                                                                                                                            |
| Profile PDF (JS-03)                | `@react-pdf/renderer`                                                                                                                                 | Generates the premium profile PDF as a vector PDF, without a headless browser                          | About 30 MB of memory and 200–400ms per PDF, versus 400–800 MB for a Chromium-based renderer. Handles concurrent downloads without the server strain a browser-based renderer would cause.                                                                                                                                                                                                 |
| Admin console (ADM module)         | shadcn/ui tables and forms for the MVP; `refine.dev` (with its Supabase data provider) evaluated for Phase 2                                          | Basic admin (ADM-01) now; full admin with reports and the MSME/Institution consoles (ADM-02, P2) later | For the MVP’s smaller admin scope, a small custom admin is likely faster to ship than adopting a new framework under a 3-week deadline. Refine’s CRUD generation pays off once the larger P2 consoles are built; we will timebox a short spike before committing either way.                                                                                                               |
| Business profile (EMP module)      | `qrcode` / `react-qr-code`                                                                                                                            | QR code generation for the shareable business profile (EMP-03)                                         | Lightweight, no server round-trip needed for generation.                                                                                                                                                                                                                                                                                                                                   |
| Institution CMS (INT module, P2)   | Tiptap or Novel.so (notion-style editor)                                                                                                              | Non-technical editing of course, faculty and inquiry-form content (INT-02)                             | Restricted to a safe block set (headings, bullets, simple tables) so college staff cannot break page styling while pasting content.                                                                                                                                                                                                                                                        |
| File uploads (all modules)         | `react-dropzone` + client-side image compression                                                                                                      | Photo, logo and brochure uploads                                                                       | Compresses images in the browser before upload, cutting storage and bandwidth by an estimated 80% and helping keep Supabase storage costs down (Section 9).                                                                                                                                                                                                                                |
| Job search visibility (JOB-02)     | `next-sitemap`, plus JobPosting structured data (JSON-LD) on each job page                                                                            | Keeps job and company pages indexable by Google                                                        | No dedicated library for the structured data; it is a small serializer, but easy to miss and required for jobs to appear correctly in search.                                                                                                                                                                                                                                              |
| Sharing (INT-04)                   | Plain `wa.me` deep links                                                                                                                              | One-click sharing of a candidate profile or brochure by WhatsApp                                       | A pre-filled message and link; this does not require the WhatsApp Business API, which is out of scope (Section 5.1).                                                                                                                                                                                                                                                                       |
| Nearby matching (GEO module, P3)   | Leaflet with OpenStreetMap tiles; PostGIS on Supabase                                                                                                 | Map view and radius search for candidate and business nodes                                            | Recommended over Google Maps to avoid per-load map billing at this scale; pairs directly with the PostGIS extension already planned for Phase 3 (Section 8.6).                                                                                                                                                                                                                             |
| Credit wallet (WAL module, P2)     | Razorpay Node SDK (not open source, but the standard choice)                                                                                          | Wallet recharge and, later, task payments                                                              | Named here because it is a hard dependency for WAL-03 and should be planned for, even though it is a paid service rather than a reusable open-source component.                                                                                                                                                                                                                            |
| Forms and validation (all modules) | `react-hook-form` + `zod` on the client; `nestjs-zod` on the API                                                                                      | Consistent validation on every form and endpoint: profiles, job posting, bulk template checks          | The same zod schema validates the form in the browser and the request on the server, so a validation rule for a module (e.g. mobile number format in BULK-02) is written once, not twice.                                                                                                                                                                                                  |
| File uploads (all modules)         | `@fastify/multipart`                                                                                                                                  | Resume, logo and bulk-import file uploads on the NestJS/Fastify API                                    | Replaces the Express-oriented `multer` pattern most Node tutorials assume; needed because the API runs on the Fastify adapter (Section 8.1).                                                                                                                                                                                                                                               |

### 8.7.2 Repository structure

A smallmonorepo keeps the website and the background worker sharing code (types,validation, UI) without duplicating it:

•     `apps/web` — Next.js site: public pages, OTP login,employer/student dashboards, admin.

•     `apps/worker` — Node.js worker container: bulk importprocessing, PDF generation, SMS dispatch, running on BullMQ.

•     `packages/database` — Supabase types, SQL migrations,row-level security policies.

•     `packages/ui` — shared design-system components.

•     Plain `pnpm` workspaces are used for this, rather thanTurborepo: with two apps and two shared packages, workspaces alone give most ofthe benefit without the extra setup and caching configuration Turborepo needs.Turborepo can be introduced in Phase 2 if the number of apps and packagesgrows.

**Net effect on the MVP timeline** Reusing these components in place of custom-built equivalents is what keeps the 145-hour MVP estimate in Section 11 realistic, particularly for bulk import, PDF generation and OTP handling — the three pieces most likely to overrun if built from zero. Each component keeps its own upstream license (MIT or Apache-2.0 throughout); none of them are modified in a way that would require us to open-source our own code in return.

9. Cost estimate at 50,000 users
   ================================

The Cost Planv2 showed three stages: 1,000 users (₹7,525 a month), 10,000 users (₹15,613)and 100,000 users (₹66,725). The 50,000-user month sits between the last two.Assumptions: 50,000 registered accounts, about 250,000 website visits, about75,000 SMS (invitations plus OTP logins at ₹0.20), and about 100,000 emails.Exchange rate ₹88 per US$1, as in the Cost Plan.

| **Item**                           | **Basis**                                                          | **Per month** |
| ---------------------------------- | ------------------------------------------------------------------ | ------------- |
| Vercel (website)                   | Pro plan for one person plus extra traffic, about $75              | ₹6,600        |
| Supabase (database, files, logins) | Pro plan plus a Small database engine and extra storage            | ₹3,080        |
| API and worker containers          | Two containers, about $50                                          | ₹4,400        |
| Resend (email)                     | Pro plan plus 50,000 emails above the included amount              | ₹5,720        |
| Upstash (cache and queue)          | Flat plan (about $10), because the queue makes many small requests | ₹880          |
| Sentry (error alerts)              | Team plan                                                          | ₹2,288        |
| SMS (invitations and OTP)          | 75,000 messages at ₹0.20                                           | ₹15,000       |
| Domain                             | ₹1,000 a year                                                      | ₹85           |
| **Estimated total**                | **About ₹0.76 per registered user**                                | **₹38,053**   |

•     **Budget ceiling:** ₹44,000 a month (estimate plus15% buffer for traffic and SMS variation).

•     **SMS is the largest line** (about 39%). Invitationsare sent in batches so the client can see and approve the cost first. A busymonth costs more only if people actually arrive.

•     **Month 2 onwards:** bulk invitations are largelyone-time, so SMS should fall unless new institutions are onboarded.

### Not included in the numbers above

•     Payment gateway fees (a percentage of each transaction,Phase 2 onwards).

•     Map display for Phase 3 nearby matching. Some providershave free allowances; the choice and cost will be confirmed before Phase 3.

•     Official WhatsApp Business API messages (not planned).

•     One-time SMS DLT registration charges, additionalVercel team members ($20 each a month), a paid Cloudflare plan, and GST.

•     If AWS is chosen, use the AWS columns of the Cost Plan.Startup credits (AWS Activate) can offset AWS bills for about two years ifapproved.

_These areplanning estimates from published prices in September 2026, not quotes._

10. Revenue model and credits
    =============================

The meetingframed three questions: who pays, why, and how. The proposed answers:

| **Who pays**             | **Why**                                                                                       | **How**                                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Employers                | To see contact details, message candidates, feature jobs, or search nearby                    | Wallet credits (a free baseline first, then recharge). Featured listings in Phase 2.                             |
| Institutions             | To give all their students access and to run a placement cell                                 | **Annual per-student sponsorship only, tiered by student count** — no separate onboarding fee. See Section 10.1. |
| Students and individuals | After 10 free job applications (confirmed — WAL-02), if the institution does not sponsor them | Wallet top-ups. 10 free applications for everyone at sign-up.                                                    |
| Task posters (Phase 3)   | Platform matching and payment handling for Job Work                                           | A percentage fee on each paid task (10% as the example).                                                         |

10.1 Institution pricing tiers
------------------------------

Institutionspay one line only — an annual fee per student, confirmed as the sole charge (noseparate flat onboarding fee). The rate is tiered by the institution’s studentcount, so a large institution pays less per student than a small one, whichreflects the lower cost of servicing one big bulk import and one placement-cellaccount rather than many small ones.

| **Tier** | **Student count**       | **Rate per student / year** | **Illustrative annual fee**                 |
| -------- | ----------------------- | --------------------------- | ------------------------------------------- |
| Small    | Up to 2,000 students    | ₹150                        | ₹75,000 at 500 students; ₹3,00,000 at 2,000 |
| Medium   | 2,001 – 10,000 students | ₹100                        | ₹5,00,000 at 5,000 students                 |
| Large    | 10,001+ students        | ₹70                         | ₹14,00,000 at 20,000 students               |

•     All students at a sponsoring institution are covered atthat institution’s tier rate — individual students are never charged separatelyonce their institution has paid.

•     Rates and tier boundaries are **admin-configurable** (WAL-04), so they can be adjusted per institution or renegotiated at renewalwithout a code change.

•     An institution that does not sponsor its students canstill onboard for free (bulk import, placement dashboard); in that case itsstudents fall back to the 10 free applications and then individual wallettop-ups, same as an unsponsored individual.
10.2 What the numbers look like
-------------------------------

•     **Institution example (Medium tier):** ₹100 perstudent across 70,000 sponsored students is ₹70 lakh a year.

•     **Break-even at 50,000-user cost:** the annualrunning cost is about ₹4.6 lakh (₹38,053 × 12). At the Medium tier(₹100/student/year), about 4,600 sponsored students cover it — for example, oneinstitution at the top of the Medium band, or several smaller ones combined.

•     **Small institutions pay a higher per-student rate buta smaller total bill:** a 1,500-student college at the Small tier (₹150) pays₹2,25,000 a year — more per student than a Medium-tier college, but a lowertotal commitment, which matters for first-time sign-on.

•     **Employer comparison:** other portals charge ₹1,000to ₹10,000 a month. At ₹1,000 a month, about 39 paying employers cover themonthly running cost.

_These areillustrations, not forecasts. The tier boundaries and rupee rates are startingpoints for the client to set and adjust (Section 13)._

11. Delivery plan, pricing and payments
    =======================================

11.1 MVP timeline (3 weeks)
---------------------------

| **When**     | **What happens**                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Before start | Client returns the decision sheet; opens service accounts (guided); **starts SMS/DLT registration**; buys the domain; pays the 40% start amount. |
| Week 1       | Repository, Docker set-up, environments, CI/CD. Login with OTP, roles, database, job seeker and business profiles.                               |
| Week 2       | Jobs, search, apply. Bulk import and invitations. Premium PDF. Basic institution and MSME roles. **Midpoint review on staging.**                 |
| Week 3       | Basic admin and audit log, notifications, hardening, load test, backup drill, client testing, fixes, production launch.                          |

11.2 Pricing summary
--------------------

Rate: ₹500 perhour. Hours are estimates; anything beyond a phase is agreed before workstarts. Phase 2 and 3 amounts are indicative and will be confirmed at the startof each phase.

| **Item**                                                                                                     | **Hours (about)** | **Amount**            | **Status**                           |
| ------------------------------------------------------------------------------------------------------------ | ----------------- | --------------------- | ------------------------------------ |
| **MVP** (Section 5)                                                                                          | 145               | ₹72,500               | Quoted                               |
| Launch readiness pack: load test, restore drill, alerts, security checklist                                  | 10                | ₹5,000                | Recommended for the 50,000-user goal |
| Full version extras: resume builder, social embeds, full admin and reports, polish (total package ₹1,15,000) | 85                | ₹42,500 above the MVP | Quoted                               |
| P2: Credit wallet with payment gateway and invoices                                                          | 35                | ₹17,500               | Estimate                             |
| P2: Institution page and inquiry form (CMS)                                                                  | 45                | ₹22,500               | Estimate                             |
| P2: Placement cell dashboard and sharing                                                                     | 30                | ₹15,000               | Estimate                             |
| P2: MSME broadcast and reports                                                                               | 30                | ₹15,000               | Estimate                             |
| P2: Agency tools                                                                                             | 15                | ₹7,500                | Estimate                             |
| P2: Featured jobs and job alerts                                                                             | 20                | ₹10,000               | Estimate                             |
| **Phase 2 total**                                                                                            | **175**           | **₹87,500**           |                                      |
| P3: Nearby matching (map, radius search, intimations)                                                        | 55                | ₹27,500               | Estimate                             |
| P3: Job Work module with service fee                                                                         | 55                | ₹27,500               | Estimate                             |
| P3: Custom domains for institutions                                                                          | 20                | ₹10,000               | Estimate                             |
| P3: Scheme eligibility and hiring-compliance tracking                                                        | 35                | ₹17,500               | Estimate; needs department rules     |
| P3: Web push, email set-up window, simple reminders                                                          | 30                | ₹15,000               | Estimate                             |
| **Phase 3 total**                                                                                            | **195**           | **₹97,500**           |                                      |

•     **Payment plan** for each phase: 40% to start, 30%at the midpoint, 30% on delivery.

•     **Care plan after launch (optional):** ₹5,000 to₹8,000 a month for fixes, updates, backups and support.

•     **Running costs** (Section 9) are paid directly bythe client to the service companies, with no markup, as in the Cost Plan.

•     **Indicative timing:** Phase 2 about 4 to 5 weeksand Phase 3 about 5 weeks after their start dates.

12. Risks and dependencies
    ==========================

| **Risk or dependency**                                           | **Effect**                                                                            | **What we do about it**                                                                                  |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| SMS DLT registration is delayed                                  | No OTP, so no login. Registration and template approval can take several days.        | Client starts registration on day 1. We build with a test mode meanwhile.                                |
| MSME Department or institutions send data late or in poor format | Fewer than 50,000 accounts in month 1                                                 | Provide the import template early; our team cleans data on request; report progress weekly.              |
| Scope grows during the 3 weeks                                   | Launch slips                                                                          | Anything outside Section 6 “MVP” goes to P2 or P3 or is priced separately.                               |
| OTP abuse by bots                                                | Unexpected SMS bill                                                                   | Section 8.4 protections and daily spend cap.                                                             |
| Sensitive personal data (Aadhaar, APAAR)                         | Legal and reputational risk if leaked or mishandled                                   | Decision D3: avoid storing full Aadhaar; consent screens; encrypted storage; legal review by the client. |
| Payment and task-payout rules for Job Work                       | Holding and paying out third-party money may need specific RBI-regulated arrangements | Use a licensed payment partner; decide the model before Phase 3 starts (D7).                             |
| Viral traffic or a large bulk send                               | Slowdown or higher bill                                                               | Caching, queue, batches, load test, spend alerts.                                                        |
| Service prices or terms change                                   | Cost differs from estimate                                                            | Prices are confirmed before opening each account; monthly review for the first three months.             |
| Startup credits (AWS) are not approved                           | If AWS was chosen for the credits, full bills start                                   | Choose Option A unless credits are approved before the build starts (as in the Cost Plan).               |

13. Open questions for the client
    =================================

Please answereach. Items marked **before start** block the build; the others can beanswered during the build.

| **#** | **Question**                                                                                                                                     | **Our suggestion**                                                                                                                                                                    | **Needed**                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| D1    | Hosting: Option A (Vercel, Supabase, Cloudflare), Option B (lean AWS) or Option C (production AWS)?                                              | Option A, unless AWS credits are approved before the build starts                                                                                                                     | Before start                          |
| D2    | Which phases are approved now: MVP only, MVP + Full, or MVP + P2?                                                                                | MVP + launch readiness now; P2 straight after                                                                                                                                         | Before start                          |
| D3    | Should the portal collect Aadhaar numbers from students?                                                                                         | No. Collect APAAR ID (optional). If identity checks are needed, use a licensed verification partner and store only a verified flag or the last four digits.                           | Before start                          |
| D4    | English only at launch, or English and Hindi?                                                                                                    | English at launch, Hindi in Phase 2, with text kept ready for translation                                                                                                             | Before start                          |
| D5    | Starter credits for job seekers                                                                                                                  | **Resolved: 10 free job applications.** Employer starter credits and per-action costs (contact views, featured listings) remain admin settings, to be set before P2.                  | Resolved ✓ (employer side: before P2) |
| D5a   | Institution pricing tiers (Section 10.1): are the Small/Medium/Large bands and ₹150/₹100/₹70 rates acceptable as the launch rates?               | **Resolved: tiered by student count**, as set out in Section 10.1. Please confirm the exact rupee rates and tier boundaries, or adjust them — they are admin-configurable either way. | Before P2                             |
| D6    | Do credits expire, and are recharges refundable? Do institution-sponsored credits expire if unused at year end?                                  | No refunds; 12-month expiry for both individual top-ups and institution-sponsored credits; the client’s legal adviser to confirm                                                      | Before P2                             |
| D7    | Job Work: who holds the task payment, and how are disputes handled?                                                                              | Use a licensed payment partner; the platform never holds funds itself                                                                                                                 | Before P3                             |
| D8    | Which data will the MSME Department share, in what format, and by when? Is a formal data-sharing agreement needed?                               | Ask for a sample file this week to test the import template                                                                                                                           | Before start                          |
| D9    | Is the 50,000 target counted from launch day? What is the split between employers and job seekers?                                               | Count from launch; report registered and activated users separately                                                                                                                   | Before start                          |
| D10   | Who is the legal owner of the accounts and the data (company name), and who signs?                                                               | Client’s registered company                                                                                                                                                           | Before start                          |
| D11   | Whiteboard notes we could not read with confidence: “Hire instant” ad idea, a “GenZ” and a “Hype.M” note, and the “Open / Freelance” side notes. | Please tell us if these are separate features or branding ideas                                                                                                                       | During build                          |
| D12   | Should the MSME Department see individual job seeker records, or only totals?                                                                    | Totals and business records only, with any personal-level access logged                                                                                                               | Before P2                             |

14. Acceptance criteria and sign-off
    ====================================

14.1 MVP acceptance
-------------------

The MVP isaccepted when the client has verified each item on staging or production:

•     A new user signs up and logs in with an OTP in under 60seconds, and cannot request unlimited OTPs.

•     An employer creates a business profile, downloads itsQR code, posts a job, and the job appears in search within one minute.

•     A job seeker completes a profile, applies to a job, andsees the status. The employer sees the applicant but not the phone number.

•     A job seeker downloads the premium PDF and every linkin it works.

•     An admin imports a 50,000-row sample file; errors arereported clearly; invited users complete OTP login from their link; the publicsite stays fast during the import.

•     The load test with 2,000 simultaneous users passes thespeed targets in Section 7.

•     The MSME Department and institution roles can importtheir own data and see only their own records.

•     The audit log records admin logins, imports andexports.

•     A database backup has been restored successfully in atest.

•     SMS templates are DLT-approved and emails reach theinbox.
14.2 Client decision and sign-off sheet
---------------------------------------

| **Decision**                      | **Client choice**                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------- |
| 1. Hosting option (D1)            | ☐ A. Recommended stack     ☐ B. Lean AWS     ☐ C. Production AWS                         |
| 2. Phases approved (D2)           | ☐ MVP     ☐ MVP + Full     ☐ MVP + Phase 2     ☐ Phase 3 later                           |
| 3. Launch readiness pack (₹5,000) | ☐ Yes     ☐ No                                                                           |
| 4. Aadhaar collection (D3)        | ☐ Do not store (recommended)     ☐ Store, with partner and consent                       |
| 5. Language at launch (D4)        | ☐ English     ☐ English and Hindi                                                        |
| 6. Monthly care plan              | ☐ Yes, ₹5,000 to ₹8,000     ☐ No                                                         |
| 7. Target launch date             | ________________                                                                         |
| Approved for the client           | Name: ______________________   Signature: ______________   Date: ___________             |
| Prepared by                       | Pj                                                               Date: 24 September 2026 |

Appendix A. What we heard and where it iscovered
================================================

| **From the meeting and whiteboard**                                                                                     | **Where it is covered**                  |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Three groups: employers (MSME, business), intermediaries (university, college, agency), employees (student, individual) | Section 4; AUTH-02, JS-01                |
| Get the MSME Department database; centralised, categorised by ownership type                                            | MSME-01, MSME-02; BULK module            |
| Message business owners in bulk                                                                                         | MSME-03 (P2)                             |
| One business profile with QR code; add email setup and reminders later                                                  | EMP-01 to EMP-03; EMP-06, EMP-07 (P3)    |
| Single job creation for the department and owners                                                                       | JOB-01 to JOB-03                         |
| Blue, white, grey and open collar jobs                                                                                  | Section 4.1; JOB-01                      |
| Placement (HR) cell, CRM and CMS for institutions; landing pages                                                        | INT-02 to INT-05 (P2)                    |
| Bulk student IDs, then OTP link and profile; direct student sign-up                                                     | BULK-01 to BULK-06; JS-01                |
| Credits as currency; sponsored students; direct top-ups; institution pricing tiers                                      | WAL-01 to WAL-06; Section 10, 10.1, 10.2 |
| Nodes by GPS, radius search, hidden phone numbers, audit trail                                                          | GEO-01 to GEO-06; JS-05; ADM-03          |
| Mandatory local hiring for subsidised MSMEs                                                                             | MSME-06 (P3)                             |
| Job Work with a 10% service fee (whiteboard: “Job Work”, 10%)                                                           | JW-01 to JW-04 (P3)                      |
| Tally-skilled B.Com student, accounting for one month at about ₹5,000 (whiteboard)                                      | JS-08; JW module                         |

Appendix B. Glossary
====================

| **Term**          | **Meaning**                                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| MSME              | Micro, Small and Medium Enterprise.                                                                                                                |
| Intermediary      | A university, college, school or agency that connects job seekers to employers.                                                                    |
| Collar categories | Blue (manual and skilled trades), white (office and professional), grey (technical or service roles that mix both), open (freelance and gig work). |
| Node, POR, AOW    | A location record. POR is the point of registration (GPS). AOW is the area of working, such as a city or district.                                 |
| Intimation        | An in-platform notification sent to a matched candidate, so phone numbers stay private.                                                            |
| Credit wallet     | A balance of credits used for actions such as applying, viewing contacts or featuring a job.                                                       |
| Sponsored student | A student whose credits are paid for by the institution.                                                                                           |
| Job Work          | Temporary, task-based work (open collar), as opposed to permanent Job Creation.                                                                    |
| OTP, DLT          | One-time password by SMS; the Indian telecom rule that requires sender and message registration.                                                   |
| Docker, container | A packaged, portable way to run a program so it behaves the same everywhere.                                                                       |
| Kubernetes        | A system for running and scaling very large numbers of containers. Not needed for this launch.                                                     |
| Terraform         | A tool that describes cloud infrastructure in files so it can be recreated exactly. Needed mainly on AWS.                                          |
| CI/CD             | Automatic testing and deployment of every code change.                                                                                             |
| APAAR ID          | The Automated Permanent Academic Account Registry ID for students in India.                                                                        |

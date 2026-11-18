# AUTH-05 / BULK-01 prerequisite split proposal

PENDING-HUMAN. The preserved prerequisite exceeds the ~400-line target (1167 production-source changed lines). No commit or branch history was rewritten, no existing change was discarded, and no split was performed.

Proposed review order:

1. BULK-01/02/03 API uploader ownership, storage references, invitation controls; API bulk tests and matching ownership decision.
2. BULK-01/02/03 worker ownership/source/no-notification behaviour; invite/import regressions, including the 50k fixtures.
3. AUTH-05/06 API browser cookie boundary and revocation; auth controller/guard/Redis changes and HTTP regressions.
4. AUTH-05/06 web BFF origin/path restrictions and server session hydration; server-api/origin policy/middleware/route files and boundary tests.
5. AUTH-05/JOB-03 workspace/job-application consumer changes and EN/HI messages; keep coupled API/profile UUID fixes with their corresponding regression.
6. AUTH-01 historical SQL/claim test baseline and migration plan/security documentation, preserving assertion bodies byte-for-byte.

Shared files (notably auth controller, worker processor fixtures, AppContext and decision documents) need reviewed hunk ownership; do not duplicate changes or split inseparable safety transitions merely for a line count. A human must approve the split plan before work starts. Existing stacked AUTH units remain reviewable against their current direct parents.

# AUTH-01 unexplained persistent development data

PENDING-HUMAN. Read-only snapshot: 2026-11-17T14:31:51.784Z; 127.0.0.1:54322/postgres; supabase_db_indian-job-portal-local. No fixtures, DDL, cleanup or deletes were executed. Counts: {"application_users":251250,"known_fixture_source":249950,"unclassified_users":1300,"auth_users":1}.

Rows with source exactly `Govt ITI Bhopal` are excluded from this inventory; source matching is evidence of fixture provenance, not a guarantee that all excluded data is synthetic. Every remaining application row and Auth row is listed by a one-way opaque fingerprint in [unexplained-data.json](unexplained-data.json), with role/status/timestamps and source classification. No contact, raw identifier, name or user metadata is exported. Unrecognised sources are fingerprinted to avoid exposing free-text PII; `direct_web` is retained as a known constant.

| Source | Role | Status | Count | Earliest created_at | Latest created_at |
| --- | --- | --- | --- | --- | --- |
| direct_web | employer | active | 170 | 2026-11-11T15:43:46.470Z | 2026-11-16T16:53:51.696Z |
| direct_web | employer | disabled | 115 | 2026-11-11T15:43:47.508Z | 2026-11-16T14:06:30.390Z |
| direct_web | intermediary | active | 24 | 2026-11-11T15:45:09.573Z | 2026-11-16T14:23:25.402Z |
| direct_web | job_seeker | active | 527 | 2026-11-11T15:43:41.052Z | 2026-11-16T16:53:51.822Z |
| direct_web | job_seeker | disabled | 16 | 2026-11-11T15:43:51.197Z | 2026-11-14T15:12:39.156Z |
| direct_web | admin | active | 171 | 2026-11-11T15:43:49.515Z | 2026-11-16T14:06:30.516Z |
| unclassified-source:098f6bcd4621d373cade4e832627b4f6 | intermediary | active | 1 | 2026-11-13T09:10:08.913Z | 2026-11-13T09:10:08.913Z |
| unclassified-source:098f6bcd4621d373cade4e832627b4f6 | job_seeker | active | 1 | 2026-11-13T09:10:08.450Z | 2026-11-13T09:10:08.450Z |
| unclassified-source:2567a5ec9705eb7ac2c984033e06189d | employer | disabled | 19 | 2026-11-11T15:43:39.420Z | 2026-11-14T15:12:33.220Z |
| unclassified-source:2567a5ec9705eb7ac2c984033e06189d | job_seeker | disabled | 16 | 2026-11-11T15:45:23.268Z | 2026-11-14T15:13:53.860Z |
| unclassified-source:2b1eadb2f34bf5092ac15c79f78141e8 | job_seeker | invited | 2 | 2026-11-14T12:27:08.221Z | 2026-11-14T12:27:08.221Z |
| unclassified-source:308004041664e280b8f21e31d4e0924b | job_seeker | invited | 12 | 2026-11-11T15:44:16.340Z | 2026-11-14T14:26:53.354Z |
| unclassified-source:3db4132910080528253648ff2fbef6b6 | job_seeker | invited | 1 | 2026-11-13T09:10:08.670Z | 2026-11-13T09:10:08.670Z |
| unclassified-source:6e4a4325119faddcb40bc653ede62deb | job_seeker | disabled | 1 | 2026-11-13T09:10:08.856Z | 2026-11-13T09:10:08.856Z |
| unclassified-source:7caa701b2bd5a182b80c72b9bdf88e2d | job_seeker | active | 19 | 2026-11-11T15:43:40.936Z | 2026-11-14T15:12:35.886Z |
| unclassified-source:7caa701b2bd5a182b80c72b9bdf88e2d | job_seeker | disabled | 16 | 2026-11-11T15:46:03.723Z | 2026-11-14T15:14:28.230Z |
| unclassified-source:9a2fd7ffae6c3d8eb4f896a4ca29c89e | employer | active | 1 | 2026-11-13T09:10:08.356Z | 2026-11-13T09:10:08.356Z |
| unclassified-source:bff9bfe08ac08ecc1e7824d3e48f831f | employer | invited | 1 | 2026-11-13T09:10:08.626Z | 2026-11-13T09:10:08.626Z |
| unclassified-source:bff9bfe08ac08ecc1e7824d3e48f831f | job_seeker | active | 1 | 2026-11-13T09:10:08.652Z | 2026-11-13T09:10:08.652Z |
| unclassified-source:d091ec2635b52f122488522bcc83382e | job_seeker | invited | 6 | 2026-11-11T15:44:27.513Z | 2026-11-14T14:26:54.750Z |
| unclassified-source:d537348226c8174e7c43ab9e1d21a16a | job_seeker | invited | 1 | 2026-11-13T09:10:08.581Z | 2026-11-13T09:10:08.581Z |
| unclassified-source:e94de8634b55ad724811406b4175ad24 | job_seeker | invited | 6 | 2026-11-11T15:44:27.929Z | 2026-11-14T14:26:54.937Z |
| unclassified-source:f46ac1b19ab96f7d94a6fcddc8b318c8 | employer | active | 1 | 2026-11-13T09:10:09.057Z | 2026-11-13T09:10:09.057Z |
| unclassified-source:fe4c0f30aa359c41d9f9a5f69c8c4192 | employer | active | 14 | 2026-11-11T15:44:18.706Z | 2026-11-14T15:13:18.251Z |
| unclassified-source:fe4c0f30aa359c41d9f9a5f69c8c4192 | intermediary | active | 126 | 2026-11-11T15:43:39.167Z | 2026-11-14T15:13:17.336Z |
| unclassified-source:fe4c0f30aa359c41d9f9a5f69c8c4192 | job_seeker | active | 15 | 2026-11-11T15:44:18.615Z | 2026-11-14T15:13:18.146Z |
| unclassified-source:fe4c0f30aa359c41d9f9a5f69c8c4192 | admin | active | 17 | 2026-11-11T15:44:17.686Z | 2026-11-14T15:13:17.446Z |

The 1300 application rows and 1 Auth rows are unclassified, not certified real or synthetic. Their existence contradicts a blanket no-data assumption. Recommend a human-reviewed backup and ownership check, then reset/recreate the persistent dev project if its owners approve. **Do not reset now; wait for the human decision.** All automated verification uses separate per-run projects regardless of that decision. Staging remains unchanged.

Query predicate: `source IS DISTINCT FROM 'Govt ITI Bhopal'`; the snapshot used `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` and ended with `ROLLBACK`.

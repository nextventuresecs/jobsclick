# AUTH-01 disposable CI contract

The workflow contains no connection strings, keys or hosted secret expressions. Ubuntu runner Docker supplies each run its own Supabase+Redis project; scripts assert its manifest/DB marker and empty initial tables. The broad existing verify suite is retained. A separate AUTH job invokes the focused migration regression selection; a database job retains generated-type freshness, catalog, attack-drill and HTTP smoke checks inside the disposable runner. No developer start/reset command is used.

Type generation now uses the pinned CLI against the verified per-run project, never the old hardcoded developer pg-meta URL. The snapshot includes native platform/application schemas and excludes test_support. Check mode fails on drift; write mode is an explicit local review operation. No new application admission/provider switch is enabled by generated types.

Both deployment placeholders deliberately exit 1 with TODO human-approved deploy. They are not successful deployments and must be replaced through human-reviewed deployment work. GitHub Actions itself is NOT RUN until an authorised future push; local workflow-policy checks and the same disposable job commands provide the local evidence.

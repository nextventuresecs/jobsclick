# AUTH-01 S2 owner-role spike

PASS locally. The temporary NOLOGIN/NOBYPASSRLS owner received SELECT on auth.users but lacked usable Auth-schema access; the end-to-end function failed with 42501. Independent application checks showed zero visible rows under RLS and denied audit INSERT with 42501. The postgres owner saw the synthetic provider/application rows and inserted one audit row. Exact privileges and errors are in result.json.

Draft decision: retain postgres ownership for narrow private functions, empty search_path, qualified references, and backend-only wrappers. Do not add broad RLS exceptions to make a limited owner work. Hosted feasibility is NOT VERIFIED; no staging call occurred.

The first ownership-transfer attempt required explicit temporary SET ROLE membership; that was added to the rollback-only spike. The entire spike, including Auth fixture, role, membership, grants, schema and audit row, was rolled back. See [probe.sql](probe.sql) and [result.json](result.json).

-- Disposable PostgreSQL fixture only. Run with psql from this directory.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE TABLE public.users (id uuid PRIMARY KEY, status text, phone text, email text, pending_email text);
CREATE TABLE public.invitations (
    id int PRIMARY KEY, phone text, email text, status text DEFAULT 'pending',
    CHECK (phone IS NOT NULL OR email IS NOT NULL)
);
CREATE TABLE public.job_seeker_profiles (id uuid PRIMARY KEY, user_id uuid REFERENCES public.users);
CREATE TABLE public.audit_logs (actor_id uuid, action text);

INSERT INTO public.users VALUES
    ('00000000-0000-4000-8000-000000000001', 'active', '9000000001', 'Owner@EXAMPLE.TEST', 'other@example.test'),
    ('00000000-0000-4000-8000-000000000002', 'active', NULL, 'second@example.test', NULL),
    ('00000000-0000-4000-8000-000000000003', 'disabled',
        'DEL_' || substr(md5('00000000-0000-4000-8000-000000000003'), 1, 10), NULL, NULL);
INSERT INTO public.job_seeker_profiles VALUES
    ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001'),
    ('00000000-0000-4000-8000-000000000013', '00000000-0000-4000-8000-000000000003');
INSERT INTO public.audit_logs VALUES ('00000000-0000-4000-8000-000000000003', 'USER_ANONYMISED');
INSERT INTO public.invitations (id, phone, email) VALUES
    (1, '9000000001', 'old-address@example.test'),
    (2, NULL, E' OWNER@example.test\t'),
    (3, NULL, 'other@example.test'),
    (4, NULL, 'owner+alias@example.test'),
    (5, NULL, 'SECOND@example.test');

\ir erasure.sql

-- Match the update made by public.anonymise_user.
UPDATE public.users
SET status = 'disabled', phone = 'DEL_' || substr(md5(id::text), 1, 10), email = NULL, pending_email = NULL
WHERE id IN ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

DO $$
BEGIN
    IF (SELECT count(*) FROM public.invitations WHERE id IN (1, 2, 5)
        AND email IS NULL AND phone LIKE 'DEL_%' AND status = 'anonymised') <> 3 THEN
        RAISE EXCEPTION 'Linked invitations were not scrubbed';
    END IF;
    IF (SELECT count(*) FROM public.invitations WHERE id IN (3, 4)
        AND email IS NOT NULL AND status = 'pending') <> 2 THEN
        RAISE EXCEPTION 'Pending addresses or aliases were modified';
    END IF;
    IF (SELECT count(*) FROM public.resume_pdf_erasure WHERE completed_at IS NULL) <> 2 THEN
        RAISE EXCEPTION 'Expected one new deletion and one historical deletion';
    END IF;
    IF has_table_privilege('anon', 'public.resume_pdf_erasure', 'SELECT')
        OR has_table_privilege('authenticated', 'public.resume_pdf_erasure', 'UPDATE')
        OR NOT has_column_privilege('service_role', 'public.resume_pdf_erasure', 'completed_at', 'UPDATE')
        OR has_column_privilege('service_role', 'public.resume_pdf_erasure', 'seeker_id', 'UPDATE') THEN
        RAISE EXCEPTION 'Incorrect erasure work permissions';
    END IF;
END;
$$;
SET LOCAL ROLE service_role;
UPDATE public.resume_pdf_erasure SET completed_at = now()
WHERE seeker_id = '00000000-0000-4000-8000-000000000011' AND completed_at IS NULL;
RESET ROLE;
DO $$
BEGIN
    IF (SELECT count(*) FROM public.resume_pdf_erasure WHERE completed_at IS NOT NULL) <> 1 THEN
        RAISE EXCEPTION 'Storage cleanup acknowledgement was not recorded';
    END IF;
END;
$$;
ROLLBACK;

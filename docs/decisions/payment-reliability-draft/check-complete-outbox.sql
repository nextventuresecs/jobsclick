\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA private_payments;
CREATE TABLE private_payments.outbox (id uuid PRIMARY KEY, attempts int NOT NULL, done_at timestamptz);
GRANT USAGE ON SCHEMA private_payments TO service_role;
INSERT INTO private_payments.outbox VALUES ('00000000-0000-4000-8000-000000000001', 0, NULL);
\ir complete-outbox.sql

SET LOCAL ROLE service_role;
SELECT private_payments.complete_outbox('00000000-0000-4000-8000-000000000001', 1, false);
SELECT private_payments.complete_outbox('00000000-0000-4000-8000-000000000001', 2, true);
SELECT private_payments.complete_outbox('00000000-0000-4000-8000-000000000001', 2, true);
DO $$
BEGIN
    BEGIN
        PERFORM private_payments.complete_outbox('00000000-0000-4000-8000-000000000001', 2, false);
        RAISE EXCEPTION 'Expected stale failure to be rejected';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'INVOICE_OUTBOX_STATE_CONFLICT' THEN RAISE; END IF;
    END;
END;
$$;
RESET ROLE;

DO $$
BEGIN
    IF (SELECT count(*) FROM private_payments.outbox WHERE done_at IS NOT NULL AND attempts = 2) <> 1 THEN
        RAISE EXCEPTION 'Outbox completion was lost';
    END IF;
    IF has_function_privilege('authenticated', 'private_payments.complete_outbox(uuid,int,boolean)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Outbox completion exposed to authenticated users';
    END IF;
END;
$$;
ROLLBACK;

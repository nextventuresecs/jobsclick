-- Human-review draft. The existing public service-role wrapper calls this function.
CREATE OR REPLACE FUNCTION private_payments.complete_outbox(
    p_id uuid,
    p_attempts int,
    p_done boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE private_payments.outbox
    SET done_at = CASE WHEN p_done THEN now() ELSE NULL END,
        attempts = p_attempts
    WHERE id = p_id AND done_at IS NULL AND attempts = p_attempts - 1;
    IF FOUND THEN
        RETURN;
    END IF;

    -- A repeated success acknowledgement must preserve the original completion time.
    IF p_done AND EXISTS (
        SELECT 1 FROM private_payments.outbox
        WHERE id = p_id AND done_at IS NOT NULL AND attempts = p_attempts
    ) THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'INVOICE_OUTBOX_STATE_CONFLICT';
END;
$$;
REVOKE ALL ON FUNCTION private_payments.complete_outbox(uuid, int, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private_payments.complete_outbox(uuid, int, boolean) TO service_role;

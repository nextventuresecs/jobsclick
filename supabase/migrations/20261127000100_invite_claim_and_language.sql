-- #134: Invite wave claim-before-send idempotency, stale-sending reaper, and Hindi language routing

ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS claimed_by_wave_id UUID REFERENCES public.invite_waves(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS language VARCHAR(8) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255);

ALTER TABLE public.bulk_import_batches
  ADD COLUMN IF NOT EXISTS language VARCHAR(8) NOT NULL DEFAULT 'en';

CREATE INDEX IF NOT EXISTS idx_invitations_batch_status_claimed
  ON public.invitations(batch_id, status, claimed_at)
  WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_pending_invitations(
  p_batch_id UUID,
  p_wave_id UUID,
  p_limit INT
)
RETURNS TABLE (
  id UUID,
  phone VARCHAR(15),
  language VARCHAR(8)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT inv.id
    FROM public.invitations inv
    WHERE inv.batch_id = p_batch_id
      AND inv.status = 'pending'
      AND inv.phone IS NOT NULL
    ORDER BY inv.created_at ASC, inv.id ASC
    LIMIT LEAST(p_limit, 5000)
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.invitations inv
  SET status = 'sending',
      claimed_at = NOW(),
      claimed_by_wave_id = p_wave_id
  FROM picked
  WHERE inv.id = picked.id
  RETURNING inv.id, inv.phone, inv.language;
END;
$$;

CREATE OR REPLACE FUNCTION public.reclaim_stale_sending_invitations(
  p_batch_id UUID,
  p_stale_minutes INT DEFAULT 15
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reclaimed INT := 0;
  v_minutes INT := GREATEST(COALESCE(p_stale_minutes, 15), 1);
BEGIN
  WITH reset_rows AS (
    UPDATE public.invitations
    SET status = 'pending',
        claimed_at = NULL,
        claimed_by_wave_id = NULL
    WHERE batch_id = p_batch_id
      AND status = 'sending'
      AND claimed_at IS NOT NULL
      AND claimed_at < NOW() - make_interval(mins => v_minutes)
    RETURNING 1
  )
  SELECT COUNT(*)::INT INTO v_reclaimed FROM reset_rows;

  RETURN v_reclaimed;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_invitations(UUID, UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_invitations(UUID, UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_pending_invitations(UUID, UUID, INT) TO jobsclick_worker;

REVOKE ALL ON FUNCTION public.reclaim_stale_sending_invitations(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_sending_invitations(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reclaim_stale_sending_invitations(UUID, INT) TO jobsclick_worker;

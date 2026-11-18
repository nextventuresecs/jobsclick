-- AUTH-05 JOB-02: public job company links use the profile slug, not an application user identifier.
BEGIN;
CREATE OR REPLACE FUNCTION public.search_public_jobs(
  p_keyword text DEFAULT NULL,p_city text DEFAULT NULL,p_category text DEFAULT NULL,
  p_min_pay numeric DEFAULT NULL,p_company uuid DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH matches AS MATERIALIZED (
    SELECT v.id,v.created_at,to_jsonb(v) || jsonb_build_object('company_id',c.id,'company_name',c.company_name) AS job, coalesce(v.is_featured AND v.featured_until>CURRENT_TIMESTAMP,false) AS promoted,
      CASE WHEN nullif(btrim(p_keyword),'') IS NULL THEN 0
        ELSE ts_rank(j.fts,plainto_tsquery('english',p_keyword)) END AS rank
    FROM public.public_jobs v JOIN public.jobs j ON j.id=v.id JOIN public.business_profiles b ON b.user_id=v.employer_id JOIN public.public_business_profiles c ON c.id=b.id
    WHERE (nullif(btrim(p_keyword),'') IS NULL OR j.fts @@ plainto_tsquery('english',p_keyword))
      AND (p_city IS NULL OR lower(v.city)=lower(p_city))
      AND (p_category IS NULL OR v.category::text=p_category)
      AND (p_min_pay IS NULL OR v.max_pay>=p_min_pay)
      AND (p_company IS NULL OR v.employer_id=(SELECT b.user_id FROM public.business_profiles b WHERE b.id=p_company))
  ), page AS (
    SELECT * FROM matches ORDER BY promoted DESC,rank DESC,created_at DESC,id
    LIMIT least(100,greatest(1,coalesce(p_limit,20))) OFFSET least(10000,greatest(0,coalesce(p_offset,0)))
  ) SELECT jsonb_build_object('jobs',coalesce((SELECT jsonb_agg(job ORDER BY promoted DESC,rank DESC,created_at DESC,id) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM matches));
$$;
REVOKE ALL ON FUNCTION public.search_public_jobs(text,text,text,numeric,uuid,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_jobs(text,text,text,numeric,uuid,integer,integer) TO service_role;


CREATE FUNCTION public.read_public_job(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT to_jsonb(j)||jsonb_build_object('company_id',c.id,'company_name',c.company_name)
 FROM public.public_jobs j JOIN public.business_profiles b ON b.user_id=j.employer_id
 JOIN public.public_business_profiles c ON c.id=b.id WHERE j.id=p_id;
$$;
REVOKE ALL ON FUNCTION public.read_public_job(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_public_job(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

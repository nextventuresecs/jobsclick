-- AUTH-05 F0-f: service-only API reads. CMS is schema-projected by the API, never raw in the view.
BEGIN;
DROP VIEW public.public_institution_profiles;
CREATE VIEW public.public_institution_profiles WITH (security_invoker=true) AS
SELECT i.id, i.institution_name, i.institution_type, i.affiliation, i.establishment_year, i.website, i.city, i.district, i.state, i.trades_offered, i.annual_capacity, i.placement_brochure_url, i.about, i.created_at
FROM public.institution_profiles i JOIN public.users u ON u.id=i.user_id
WHERE i.is_published AND u.role='intermediary' AND u.status='active' AND u.phone ~ '^[6-9][0-9]{9}$';
REVOKE ALL ON public.public_institution_profiles FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.public_institution_profiles TO service_role;

CREATE FUNCTION public.search_public_jobs(
  p_keyword text DEFAULT NULL,p_city text DEFAULT NULL,p_category text DEFAULT NULL,
  p_min_pay numeric DEFAULT NULL,p_company uuid DEFAULT NULL,p_limit integer DEFAULT 20,p_offset integer DEFAULT 0
) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH matches AS MATERIALIZED (
    SELECT v.id,v.created_at,to_jsonb(v) AS job, coalesce(v.is_featured AND v.featured_until>CURRENT_TIMESTAMP,false) AS promoted,
      CASE WHEN nullif(btrim(p_keyword),'') IS NULL THEN 0
        ELSE ts_rank(j.fts,plainto_tsquery('english',p_keyword)) END AS rank
    FROM public.public_jobs v JOIN public.jobs j ON j.id=v.id
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

CREATE FUNCTION public.read_public_institution_cms(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  SELECT jsonb_build_object('content',i.cms_data) FROM public.institution_profiles i
  JOIN public.public_institution_profiles v ON v.id=i.id WHERE v.id=p_id;
$$;
REVOKE ALL ON FUNCTION public.read_public_institution_cms(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_public_institution_cms(uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
CREATE ROLE auth_owner_role_4199fbc7600048fa9f7733c0adb263bf NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
GRANT auth_owner_role_4199fbc7600048fa9f7733c0adb263bf TO postgres;
CREATE SCHEMA auth_owner_4199fbc7600048fa9f7733c0adb263bf;
CREATE TABLE auth_owner_4199fbc7600048fa9f7733c0adb263bf.users(LIKE public.users INCLUDING ALL);
CREATE TABLE auth_owner_4199fbc7600048fa9f7733c0adb263bf.audit_logs(LIKE public.audit_logs INCLUDING ALL);
ALTER TABLE auth_owner_4199fbc7600048fa9f7733c0adb263bf.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_owner_4199fbc7600048fa9f7733c0adb263bf.audit_logs ENABLE ROW LEVEL SECURITY;
INSERT INTO auth_owner_4199fbc7600048fa9f7733c0adb263bf.users(id,phone,role,status) VALUES('3e158a1c-0b0a-47e1-ace2-c308c526a64d','9000000040','employer','invited');
INSERT INTO auth.users(id) VALUES('3e158a1c-0b0a-47e1-ace2-c308c526a64d');
GRANT USAGE,CREATE ON SCHEMA auth_owner_4199fbc7600048fa9f7733c0adb263bf TO auth_owner_role_4199fbc7600048fa9f7733c0adb263bf;
GRANT USAGE ON SCHEMA auth TO auth_owner_role_4199fbc7600048fa9f7733c0adb263bf;
GRANT SELECT ON auth.users,auth_owner_4199fbc7600048fa9f7733c0adb263bf.users TO auth_owner_role_4199fbc7600048fa9f7733c0adb263bf;
GRANT INSERT ON auth_owner_4199fbc7600048fa9f7733c0adb263bf.audit_logs TO auth_owner_role_4199fbc7600048fa9f7733c0adb263bf;
CREATE FUNCTION auth_owner_4199fbc7600048fa9f7733c0adb263bf.probe(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a integer; u integer;
BEGIN
 SELECT count(*) INTO a FROM auth.users WHERE id=p_id;
 SELECT count(*) INTO u FROM auth_owner_4199fbc7600048fa9f7733c0adb263bf.users WHERE id=p_id;
 INSERT INTO auth_owner_4199fbc7600048fa9f7733c0adb263bf.audit_logs(actor_id,action,meta) VALUES(p_id,'auth.owner_probe','{}');
 RETURN jsonb_build_object('provider_visible',a,'application_visible',u);
END;
$$;
REVOKE ALL ON FUNCTION auth_owner_4199fbc7600048fa9f7733c0adb263bf.probe(uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION auth_owner_4199fbc7600048fa9f7733c0adb263bf.probe(uuid) OWNER TO auth_owner_role_4199fbc7600048fa9f7733c0adb263bf;
-- Then exercise both owners and ROLLBACK; see result.json.

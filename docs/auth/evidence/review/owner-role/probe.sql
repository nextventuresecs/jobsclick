BEGIN;
CREATE ROLE auth_owner_role_4ea4aa430e9d4e5e8c73f366991b094e NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS;
GRANT auth_owner_role_4ea4aa430e9d4e5e8c73f366991b094e TO postgres;
CREATE SCHEMA auth_owner_4ea4aa430e9d4e5e8c73f366991b094e;
CREATE TABLE auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.users(LIKE public.users INCLUDING ALL);
CREATE TABLE auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.audit_logs(LIKE public.audit_logs INCLUDING ALL);
ALTER TABLE auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.audit_logs ENABLE ROW LEVEL SECURITY;
INSERT INTO auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.users(id,phone,role,status) VALUES('225c19cb-08a8-4ec9-8a24-5dd901931061','9000000040','employer','invited');
INSERT INTO auth.users(id) VALUES('225c19cb-08a8-4ec9-8a24-5dd901931061');
GRANT USAGE,CREATE ON SCHEMA auth_owner_4ea4aa430e9d4e5e8c73f366991b094e TO auth_owner_role_4ea4aa430e9d4e5e8c73f366991b094e;
GRANT USAGE ON SCHEMA auth TO auth_owner_role_4ea4aa430e9d4e5e8c73f366991b094e;
GRANT SELECT ON auth.users,auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.users TO auth_owner_role_4ea4aa430e9d4e5e8c73f366991b094e;
GRANT INSERT ON auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.audit_logs TO auth_owner_role_4ea4aa430e9d4e5e8c73f366991b094e;
CREATE FUNCTION auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.probe(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a integer; u integer;
BEGIN
 SELECT count(*) INTO a FROM auth.users WHERE id=p_id;
 SELECT count(*) INTO u FROM auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.users WHERE id=p_id;
 INSERT INTO auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.audit_logs(actor_id,action,meta) VALUES(p_id,'auth.owner_probe','{}');
 RETURN jsonb_build_object('provider_visible',a,'application_visible',u);
END;
$$;
REVOKE ALL ON FUNCTION auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.probe(uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION auth_owner_4ea4aa430e9d4e5e8c73f366991b094e.probe(uuid) OWNER TO auth_owner_role_4ea4aa430e9d4e5e8c73f366991b094e;
-- Then exercise both owners and ROLLBACK; see result.json.

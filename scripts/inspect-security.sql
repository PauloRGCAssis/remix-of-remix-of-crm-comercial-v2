BEGIN TRANSACTION READ ONLY;
SELECT n.nspname AS schema, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%'
AND c.relkind IN ('r', 'p', 'v', 'm') ORDER BY 1, 2;
SELECT * FROM pg_policies ORDER BY schemaname, tablename, policyname;
SELECT * FROM information_schema.role_table_grants WHERE grantee IN ('anon', 'authenticated', 'PUBLIC') ORDER BY table_schema, table_name;
SELECT * FROM information_schema.column_privileges WHERE grantee IN ('anon', 'authenticated', 'PUBLIC') ORDER BY table_schema, table_name;
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS arguments,
 p.prosecdef, p.proconfig, p.proacl, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f' ORDER BY 1, 2;
SELECT event_object_schema, event_object_table, trigger_name, action_statement FROM information_schema.triggers;
ROLLBACK;

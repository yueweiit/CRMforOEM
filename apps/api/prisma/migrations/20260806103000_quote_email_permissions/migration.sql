WITH permission_definitions(code, name, module, permission_group, depends_on) AS (
  VALUES
    ('quotes.read', 'View quotes', 'quotes', '报价管理', '["customers.read"]'::jsonb),
    ('quotes.write', 'Create and update quotes', 'quotes', '报价管理', '["quotes.read"]'::jsonb),
    ('quotes.approve', 'Approve quotes', 'quotes', '报价管理', '["quotes.read"]'::jsonb),
    ('quotes.export', 'Export quotes', 'quotes', '报价管理', '["quotes.read"]'::jsonb),
    ('quotes.send', 'Send approved quotes', 'quotes', '报价管理', '["quotes.read", "emails.send"]'::jsonb),
    ('quotes.reference.read', 'Reference historical quotes', 'quotes', '报价管理', '["quotes.read"]'::jsonb),
    ('quotes.resolve_reply', 'Resolve customer quote replies', 'quotes', '报价管理', '["quotes.read"]'::jsonb)
)
INSERT INTO "permissions" ("id", "organizationId", "code", "name", "module", "group", "dependsOn")
SELECT
  'perm_' || md5(organization."id" || ':' || definition.code),
  organization."id",
  definition.code,
  definition.name,
  definition.module,
  definition.permission_group,
  definition.depends_on
FROM "organizations" organization
CROSS JOIN permission_definitions definition
ON CONFLICT ("organizationId", "code") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "module" = EXCLUDED."module",
  "group" = EXCLUDED."group",
  "dependsOn" = EXCLUDED."dependsOn";

WITH role_permission_map(role_code, permission_code) AS (
  VALUES
    ('ADMIN', 'quotes.read'),
    ('ADMIN', 'quotes.write'),
    ('ADMIN', 'quotes.approve'),
    ('ADMIN', 'quotes.export'),
    ('ADMIN', 'quotes.send'),
    ('ADMIN', 'quotes.reference.read'),
    ('ADMIN', 'quotes.resolve_reply'),
    ('EXECUTIVE', 'quotes.read'),
    ('EXECUTIVE', 'quotes.approve'),
    ('EXECUTIVE', 'quotes.export'),
    ('EXECUTIVE', 'quotes.reference.read'),
    ('SALES_MANAGER', 'quotes.read'),
    ('SALES_MANAGER', 'quotes.write'),
    ('SALES_MANAGER', 'quotes.approve'),
    ('SALES_MANAGER', 'quotes.export'),
    ('SALES_MANAGER', 'quotes.send'),
    ('SALES_MANAGER', 'quotes.reference.read'),
    ('SALES_MANAGER', 'quotes.resolve_reply'),
    ('SALES_REP', 'quotes.read'),
    ('SALES_REP', 'quotes.write'),
    ('SALES_REP', 'quotes.export'),
    ('SALES_REP', 'quotes.send'),
    ('SALES_REP', 'quotes.reference.read'),
    ('SALES_REP', 'quotes.resolve_reply')
)
INSERT INTO "role_permissions" ("roleId", "permissionId")
SELECT role."id", permission."id"
FROM "roles" role
JOIN role_permission_map mapping ON mapping.role_code = role."code"
JOIN "permissions" permission
  ON permission."organizationId" = role."organizationId"
 AND permission."code" = mapping.permission_code
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

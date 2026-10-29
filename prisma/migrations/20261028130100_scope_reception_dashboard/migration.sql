-- Backfill for the reception desk's shortened screen.
-- The assistant existed for every dashboard account before this change, so everyone except
-- the reception role keeps it — nothing is taken away from the other employees.
INSERT INTO "user_permissions" ("id", "userId", "permission")
SELECT md5(u.id || '-use-assistant'), u.id, 'USE_ASSISTANT'::"Permission"
FROM "users" u WHERE u.role <> 'RECEPTIONIST'
ON CONFLICT ("userId", "permission") DO NOTHING;

-- The desk's dashboard shows the floor, not the till: revenue, expenses total, net profit,
-- outstanding balances and the six-month financial trend are taken off the reception role.
-- The expenses he records himself stay (VIEW_EXPENSES / CREATE_EXPENSES are untouched).
DELETE FROM "user_permissions"
WHERE "permission" IN (
  'VIEW_DASHBOARD_REVENUE',
  'VIEW_DASHBOARD_EXPENSES',
  'VIEW_DASHBOARD_PROFIT',
  'VIEW_DASHBOARD_OUTSTANDING',
  'VIEW_FINANCIAL_REPORTS',
  'USE_ASSISTANT'
)
AND "userId" IN (SELECT id FROM "users" WHERE role = 'RECEPTIONIST');

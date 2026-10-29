-- Backfill: the new permissions are only additive for accounts that already had the access.
-- A reception account is the one being scoped down, so it keeps its member list but gains
-- expense entry instead of the census and the sheet.

-- Everyone who could already read the members list keeps the sheet and the census,
-- except the reception role this change is about.
INSERT INTO "user_permissions" ("id", "userId", "permission")
SELECT md5("userId" || '-export-members'), "userId", 'EXPORT_MEMBERS'::"Permission"
FROM "user_permissions"
WHERE "permission" = 'VIEW_MEMBERS'
  AND "userId" IN (SELECT id FROM "users" WHERE role <> 'RECEPTIONIST')
ON CONFLICT ("userId", "permission") DO NOTHING;

INSERT INTO "user_permissions" ("id", "userId", "permission")
SELECT md5("userId" || '-view-member-stats'), "userId", 'VIEW_MEMBER_STATS'::"Permission"
FROM "user_permissions"
WHERE "permission" = 'VIEW_MEMBERS'
  AND "userId" IN (SELECT id FROM "users" WHERE role <> 'RECEPTIONIST')
ON CONFLICT ("userId", "permission") DO NOTHING;

-- Paying wages used to ride on CREATE_EXPENSES; it now has its own permission, so every
-- account that could pay out before keeps being able to.
INSERT INTO "user_permissions" ("id", "userId", "permission")
SELECT md5("userId" || '-manage-salaries'), "userId", 'MANAGE_SALARIES'::"Permission"
FROM "user_permissions"
WHERE "permission" IN ('CREATE_EXPENSES', 'EDIT_EXPENSES', 'DELETE_EXPENSES')
ON CONFLICT ("userId", "permission") DO NOTHING;

-- The reception desk records expenses as part of its job.
INSERT INTO "user_permissions" ("id", "userId", "permission")
SELECT md5(u.id || '-rec-view-expenses'), u.id, 'VIEW_EXPENSES'::"Permission"
FROM "users" u WHERE u.role = 'RECEPTIONIST'
ON CONFLICT ("userId", "permission") DO NOTHING;

INSERT INTO "user_permissions" ("id", "userId", "permission")
SELECT md5(u.id || '-rec-create-expenses'), u.id, 'CREATE_EXPENSES'::"Permission"
FROM "users" u WHERE u.role = 'RECEPTIONIST'
ON CONFLICT ("userId", "permission") DO NOTHING;

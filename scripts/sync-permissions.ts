// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Permission-only DB sync
// Rebuilds the rolepermission rows for every built-in role from
// prisma/permission-sets.ts (single source of truth).
//
// Safe by design: touches ONLY the rolepermission table.
// Unlike `npm run db:seed` it does not upsert employees, system
// settings, leave types or evaluation forms — demo data is safe.
// Also removes stale identifiers no longer in any set (e.g. the
// retired `groups.manage`).
//
// Usage:  npx tsx scripts/sync-permissions.ts
// ═══════════════════════════════════════════════════════════════

import { db } from "../src/lib/db";
import { ROLE_PERMISSION_SETS } from "../prisma/permission-sets";

async function main() {
  console.log("Syncing role permissions from prisma/permission-sets.ts ...\n");

  let totalBefore = 0;
  let totalAfter = 0;

  for (const [roleName, perms] of Object.entries(ROLE_PERMISSION_SETS)) {
    const role = await db.role.findUnique({ where: { name: roleName } });
    if (!role) {
      console.log(`  SKIP  ${roleName} — not found in DB`);
      continue;
    }

    const before = await db.rolePermission.count({ where: { roleId: role.id } });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    await db.rolePermission.createMany({
      data: perms.map((identifier) => ({
        roleId: role.id,
        identifier,
        granted: true,
      })),
    });

    totalBefore += before;
    totalAfter += perms.length;
    const delta = perms.length - before;
    const sign = delta >= 0 ? `+${delta}` : `${delta}`;
    console.log(`  OK    ${roleName.padEnd(14)} ${before} → ${perms.length} rows (${sign})`);
  }

  // Roles not managed by the seed (custom roles created via the UI) are
  // intentionally left untouched.
  const unmapped = await db.role.findMany({ select: { name: true } });
  for (const r of unmapped) {
    if (!(r.name in ROLE_PERMISSION_SETS)) {
      console.log(`  KEEP  ${r.name.padEnd(14)} — custom role, left untouched`);
    }
  }

  // Global sanity check: stale identifiers across all roles.
  const valid = new Set(Object.values(ROLE_PERMISSION_SETS).flat());
  const distinct = await db.rolePermission.findMany({
    select: { identifier: true },
    distinct: ["identifier"],
  });
  const stale = distinct.map((r) => r.identifier).filter((id) => !valid.has(id));

  console.log(`\nTotals: ${totalBefore} → ${totalAfter} rows across mapped roles`);
  if (stale.length > 0) {
    console.log(`⚠ Stale identifiers still present (custom roles?): ${stale.join(", ")}`);
  } else {
    console.log("✓ No stale identifiers in the database.");
  }
}

main()
  .catch((err) => {
    console.error("✗ Sync failed:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

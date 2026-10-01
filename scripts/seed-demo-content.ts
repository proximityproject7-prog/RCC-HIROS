// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Demo Content Seed (PART 1/6: header, RNG, lookups)
// Adds believable demo rows WITHOUT touching base catalog or real
// user-entered data. Idempotent: re-running skips existing demo rows.
// Run: npx tsx scripts/seed-demo-content.ts [--seed rcc-demo-01]
// ═══════════════════════════════════════════════════════════════
import { db } from "../src/lib/db";

const SEED = process.argv.find((a) => a.startsWith("--seed="))?.split("=")[1]
  ?? process.env.DEMO_SEED ?? "rcc-demo-01";
const YEAR = 2026;
const SCHOOL_YEAR = "2026-2027";
const SENTINEL = "demo_seed_content_v1";
// __PART2__
// Seeded RNG (mulberry32 + string hash) — same gaps every run.
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(hashSeed(SEED));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
const chance = (p: number): boolean => rand() < p;
const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function computeWorkdays(start: Date, end: Date): number {
  let n = 0; const c = new Date(start);
  while (c <= end) { const d = c.getDay(); if (d !== 0 && d !== 6) n++; c.setDate(c.getDate() + 1); }
  return n;
}
function addDays(base: Date, n: number): Date { const d = new Date(base); d.setDate(d.getDate() + n); return d; }
// __PART3__
interface Emp { id: string; employeeId: string; firstName: string; lastName: string; groupId: string | null; roleId: string | null; groupName: string | null; }
async function main() {
  console.log(`=== DEMO CONTENT SEED (seed=${SEED}) ===\n`);
  const employees = await db.employee.findMany({ include: { group: true } });
  if (employees.length === 0) { console.log("No employees. Run base seed first (npm run db:seed)."); return; }
  const emps: Emp[] = employees.map((e) => ({ id: e.id, employeeId: e.employeeId, firstName: e.firstName, lastName: e.lastName, groupId: e.groupId, roleId: e.roleId, groupName: (e as unknown as { group?: { name: string } | null }).group?.name ?? null }));
  const real = new Set(emps.filter((e) => e.employeeId === "EMP-0000" || e.employeeId === "EMP-0004").map((e) => e.id));
  const pool = emps.filter((e) => !real.has(e.id));
  console.log(`Employees: ${emps.length} (pool: ${pool.length}, protected real: ${real.size})`);
  const setting = await db.systemSetting.findUnique({ where: { key: "fpas_enabled_groups" } });
  let enabledIds: string[] = [];
  try { enabledIds = setting?.value ? JSON.parse(setting.value) : []; } catch { enabledIds = []; }
  console.log(`FPAS enabled groups: ${enabledIds.length === 0 ? "ALL (empty list)" : enabledIds.join(", ")}`);
  const isEligible = (e: Emp) => enabledIds.length === 0 || (e.groupId !== null && enabledIds.includes(e.groupId));
  const types = await db.leaveType.findMany();
  const typeByCode = Object.fromEntries(types.map((t) => [t.code, t]));
  const perms = await db.rolePermission.findMany();
  const roleHas = (roleId: string | null, perm: string) => !!roleId && perms.some((p) => p.roleId === roleId && p.identifier === perm && p.granted);
  const l1Pool = emps.filter((e) => roleHas(e.roleId, "leave.approve_l1"));
  const l2Pool = emps.filter((e) => roleHas(e.roleId, "leave.approve_l2"));
  const L1 = l1Pool.length > 0 ? l1Pool : emps.filter((e) => e.employeeId === "EMP-0001");
  const L2 = l2Pool.length > 0 ? l2Pool : emps.filter((e) => e.employeeId === "EMP-0000");
  console.log(`Approvers: L1=${L1.map((e) => e.employeeId).join(",")} L2=${L2.map((e) => e.employeeId).join(",")}`);
// __PART4__
  // ── Balances (idempotent: only create missing) ──
  let balMade = 0;
  for (const e of pool) {
    for (const t of types) {
      const ex = await db.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: t.id, year: YEAR } } });
      if (!ex) {
        const total = t.code === "VL" ? 15 : t.code === "SL" ? 15 : t.code === "EL" ? 5 : 7;
        await db.leaveBalance.create({ data: { employeeId: e.id, leaveTypeId: t.id, year: YEAR, totalDays: total, usedDays: 0 } });
        balMade++;
      }
    }
  }
  console.log(`Balances ensured (${balMade} created).`);
  // ── Leave requests (skip entirely on re-run: demo requests already exist) ──
  const demoLeaves = await db.auditLog.count({ where: { action: "Create Leave Request", metadata: { contains: SENTINEL } } });
  const VL = typeByCode["VL"] ?? types[0]; const SL = typeByCode["SL"] ?? types[0]; const EL = typeByCode["EL"] ?? types[0];
  const reasons = ["Family event out of town", "Medical check-up and rest", "Attending a wedding", "Home repairs and errands", "Child's school activity", "Fever and flu recovery", "Dental procedure", "Family emergency"];
  const base = new Date(`${YEAR}-01-05T00:00:00`);
  const existingNos = new Set((await db.leaveRequest.findMany({ select: { requestNo: true } })).map((r) => r.requestNo));
  let noSeq = 15;
  const nextNo = () => { let n = `LR-${String(noSeq).padStart(4, "0")}`; while (existingNos.has(n)) { noSeq++; n = `LR-${String(noSeq).padStart(4, "0")}`; } existingNos.add(n); noSeq++; return n; };
  let lrMade = 0, apMade = 0;
  if (demoLeaves > 0) {
    console.log(`Leave requests: skipped (demo requests already seeded).`);
  } else {
  for (const e of shuffle(pool)) {
    if (!chance(0.6)) continue; // ~40% file nothing
    const nReq = chance(0.7) ? 1 : 2;
    for (let k = 0; k < nReq; k++) {
      const t = chance(0.5) ? VL : chance(0.6) ? SL : EL;
      const start = addDays(base, int(10, 260));
      const end = addDays(start, chance(0.7) ? int(0, 1) : int(2, 4));
      const workdays = Math.max(1, computeWorkdays(start, end));
      const outcome = chance(0.45) ? "approved" : chance(0.25) ? "pending_l1" : chance(0.15) ? "pending_l2" : "rejected";
      const l1 = pick(L1.filter((a) => a.id !== e.id).length > 0 ? L1.filter((a) => a.id !== e.id) : L1);
      const l2 = pick(L2.filter((a) => a.id !== e.id && a.id !== l1.id).length > 0 ? L2.filter((a) => a.id !== e.id && a.id !== l1.id) : L2);
      const req = await db.leaveRequest.create({ data: { requestNo: nextNo(), employeeId: e.id, leaveTypeId: t.id, startDate: start, endDate: end, workdays, reason: pick(reasons), status: outcome } });
      lrMade++;
      await db.auditLog.create({ data: { userId: e.id, action: "Create Leave Request", entity: "LeaveRequest", entityId: req.id, metadata: JSON.stringify({ requestNo: req.requestNo, demoSeed: SENTINEL }) } });
      if (outcome === "pending_l2" || outcome === "approved") {
        await db.leaveApproval.create({ data: { leaveRequestId: req.id, level: 1, approverId: l1.id, status: "approved", remarks: "Verified. Forwarded.", actedAt: addDays(start, -3) } });
        apMade++;
        await db.auditLog.create({ data: { userId: l1.id, action: "Approve Leave (L1)", entity: "LeaveRequest", entityId: req.id, metadata: JSON.stringify({ requestNo: req.requestNo, demoSeed: SENTINEL }) } });
      }
      if (outcome === "approved") {
        await db.leaveApproval.create({ data: { leaveRequestId: req.id, level: 2, approverId: l2.id, status: "approved", remarks: "Approved.", actedAt: addDays(start, -2) } });
        apMade++;
        const bal = await db.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: t.id, year: start.getFullYear() } } });
        if (bal) await db.leaveBalance.update({ where: { id: bal.id }, data: { usedDays: bal.usedDays + workdays } });
        await db.auditLog.create({ data: { userId: l2.id, action: "Approve Leave (L2)", entity: "LeaveRequest", entityId: req.id, metadata: JSON.stringify({ requestNo: req.requestNo, demoSeed: SENTINEL }) } });
      }
      if (outcome === "rejected") {
        const atL2 = chance(0.3);
        if (!atL2) {
          await db.leaveApproval.create({ data: { leaveRequestId: req.id, level: 1, approverId: l1.id, status: "rejected", remarks: "Insufficient staffing on requested dates.", actedAt: addDays(start, -3) } });
        } else {
          await db.leaveApproval.create({ data: { leaveRequestId: req.id, level: 1, approverId: l1.id, status: "approved", remarks: "Forwarded.", actedAt: addDays(start, -4) } });
          await db.leaveApproval.create({ data: { leaveRequestId: req.id, level: 2, approverId: l2.id, status: "rejected", remarks: "Exceeds remaining balance.", actedAt: addDays(start, -2) } });
          apMade++;
        }
        apMade++;
      }
    }
  }
  }
  console.log(`Leave requests: ${lrMade} created, ${apMade} approvals.`);
// __PART5__
  // ── FPAS submissions (eligible pool only, skip existing) ──
  let rowSeq = 1;
  const mkRow = (title: string, nature: string, points: number) => ({ id: `demo-r${rowSeq++}-${Math.floor(rand() * 1e6).toString(36)}`, title, nature, points });
  const SEMINARS = ["CHED Regional Research Colloquium", "Orial: AI in the Classroom", "PAASCU Self-Survey Workshop", "In-House Pedagogy Retooling", "National e-Learning Summit"];
  const ORGS = ["PAFTE", "PSITE Central Luzon", "PEMAP", "Philippine Statistical Association"];
  const PROJ = ["Community Literacy Drive", "Coastal Clean-Up", "Brigada Eskwela", "Feeding Program"];
  function buildForm(e: Emp, tier: number) {
    const hi = tier === 0, mid = tier === 1;
    const pv = (h: number, m: number, l: number) => (hi ? h : mid ? m : l);
    const fd = {
      header: { name: `${e.firstName} ${e.lastName}`, department: e.groupName ?? "", dateEnteredRcc: "2019-06-01", degreeInstitution: "Holy Angel University", schoolYear: SCHOOL_YEAR },
      criteria1: { studentEvaluation: pv(6, 5, 4), classroomPerformance: pv(6, 5, 4), gradeSubmission: 2, gradeAccuracy: hi || mid ? 1 : 0, classRecordSubmission: 1, gradingSheetSubmission: 1, syllabiSubmission: pv(2, 2, 1), syllabiFormat: true, syllabiObjectives: hi || mid, syllabiReferences: hi, testPaperSubmission: 1, testItemQuality: pv(2, 2, 1), testAdministration: 1 },
      criteria2: { absences: pv(6, 5, 4), tardiness: pv(5, 4, 3), schoolActivities: pv(3, 3, 2), facultyMeetings: pv(3, 2, 2), libraryVisits: pv(3, 2, 1) },
      criteria3: {
        graduateDegree: hi ? [mkRow("MS Computer Science", "Holy Angel University", 9)] : mid ? [mkRow("MIT units (24)", "Angeles University Foundation", 4)] : [],
        facultyDevelopment: hi || mid ? [mkRow(pick(SEMINARS), "Participant", 2)] : [],
        seminars: hi ? [mkRow(pick(SEMINARS), "Paper Presenter", 2), mkRow(pick(SEMINARS), "Participant", 1)] : mid && chance(0.6) ? [mkRow(pick(SEMINARS), "Participant", 1)] : [],
        specialStudies: hi && chance(0.5) ? [mkRow("TESDA NC II Training", "Completed", 1)] : [],
        awards: hi && chance(0.6) ? [mkRow("Best Research Paper", "University Research Colloquium", 2)] : [],
        professionalOrgs: hi ? [mkRow(pick(ORGS), "Member", 2)] : mid && chance(0.5) ? [mkRow(pick(ORGS), "Member", 1)] : [],
      },
      criteria4: {
        discoveries: hi && chance(0.4) ? [mkRow("Low-Cost IoT Attendance Device", "Lead Innovator", 5)] : [],
        publications: hi ? [mkRow("Modular Learning in IT Education", "Co-Author", 3)] : mid && chance(0.4) ? [mkRow("Classroom Action Research Notes", "Author", 2)] : [],
        researchStudies: hi ? [mkRow("Student Retention in CCS", "Presenter", 3)] : [],
        researchArticles: hi && chance(0.5) ? [mkRow("AI Adoption Among Faculty", "Published", 3)] : [],
      },
      criteria5: {
        adviser: hi || mid ? [mkRow("JPCS Chapter", "2026-2027", 2)] : [],
        coach: hi && chance(0.5) ? [mkRow("Regional Programming Contest", "2026-2027", 2)] : [],
        officialFunctions: chance(0.6) ? [mkRow("Foundation Anniversary", "Working Committee", 1)] : [],
      },
      criteria6: {
        projectsInitiated: hi && chance(0.5) ? [mkRow(pick(PROJ), "Organizer", 3)] : [],
        projectsParticipated: chance(0.6) ? [mkRow(pick(PROJ), "Volunteer", 2)] : [],
        memberships: hi && chance(0.5) ? [mkRow("Rotary Club of Angeles", "Member", 2)] : [],
      },
    };
    return fd;
  }
  function totalOf(fd: ReturnType<typeof buildForm>): number {
    const c1 = fd.criteria1.studentEvaluation + fd.criteria1.classroomPerformance + fd.criteria1.gradeSubmission + fd.criteria1.gradeAccuracy + fd.criteria1.classRecordSubmission + fd.criteria1.gradingSheetSubmission + fd.criteria1.syllabiSubmission + (fd.criteria1.syllabiFormat ? 0.5 : 0) + (fd.criteria1.syllabiObjectives ? 1 : 0) + (fd.criteria1.syllabiReferences ? 0.5 : 0) + fd.criteria1.testPaperSubmission + fd.criteria1.testItemQuality + fd.criteria1.testAdministration;
    const c2 = fd.criteria2.absences + fd.criteria2.tardiness + fd.criteria2.schoolActivities + fd.criteria2.facultyMeetings + fd.criteria2.libraryVisits;
    const sum = (rows: { points: number }[]) => rows.reduce((a, r) => a + (Number(r.points) || 0), 0);
    const capT = (rows: { points: number }[], m?: number) => (m === undefined ? sum(rows) : Math.min(sum(rows), m));
    const cap = (v: number, m: number) => Math.min(v, m);
    const c3 = cap(capT(fd.criteria3.graduateDegree, 9) + capT(fd.criteria3.facultyDevelopment, 4) + capT(fd.criteria3.seminars, 3) + sum(fd.criteria3.specialStudies) + capT(fd.criteria3.awards, 4) + capT(fd.criteria3.professionalOrgs, 3), 20);
    const c4 = cap(capT(fd.criteria4.discoveries, 7) + sum(fd.criteria4.publications) + capT(fd.criteria4.researchStudies, 5) + capT(fd.criteria4.researchArticles, 4), 16);
    const c5 = cap(capT(fd.criteria5.adviser, 3) + capT(fd.criteria5.coach, 3) + capT(fd.criteria5.officialFunctions, 3), 9);
    const c6 = cap(capT(fd.criteria6.projectsInitiated, 4) + capT(fd.criteria6.projectsParticipated, 3) + capT(fd.criteria6.memberships, 3), 10);
    return Math.min(cap(c1, 25) + cap(c2, 20) + c3 + c4 + c5 + c6, 100);
  }
  let fpasMade = 0;
  for (const e of shuffle(pool)) {
    if (!isEligible(e)) continue;
    if (!chance(0.65)) continue; // ~35% submit nothing
    const ex = await db.fpasSubmission.findUnique({ where: { employeeId_schoolYear: { employeeId: e.id, schoolYear: SCHOOL_YEAR } } });
    if (ex) continue;
    const tier = chance(0.3) ? 0 : chance(0.6) ? 1 : 2;
    const fd = buildForm(e, tier);
    await db.fpasSubmission.create({ data: { employeeId: e.id, schoolYear: SCHOOL_YEAR, formData: JSON.stringify(fd), totalPoints: totalOf(fd) } });
    fpasMade++;
  }
  console.log(`FPAS submissions: ${fpasMade} created for ${SCHOOL_YEAR}.`);
// __PART6__
  // ── Attendance top-up (Sept 2026 weekdays, skip existing) ──
  let attMade = 0;
  const day = new Date(`${YEAR}-09-01T00:00:00`);
  const endM = new Date(`${YEAR}-09-30T00:00:00`);
  while (day <= endM) {
    const dow = day.getDay();
    if (dow !== 0 && dow !== 6) {
      for (const e of pool) {
        if (!chance(0.85)) continue; // ~15% absent/no record
        const dStart = new Date(day); dStart.setHours(0, 0, 0, 0);
        const ex = await db.attendance.findUnique({ where: { employeeId_date: { employeeId: e.id, date: dStart } } });
        if (ex) continue;
        const late = chance(0.12);
        const inH = late ? 8 : 7, inM = late ? int(6, 45) : int(30, 59);
        const inAt = new Date(day); inAt.setHours(inH, inM, 0, 0);
        const outAt = new Date(day); outAt.setHours(17, int(0, 35), 0, 0);
        await db.attendance.create({ data: { employeeId: e.id, date: dStart, clockInAt: inAt, clockOutAt: chance(0.97) ? outAt : null, biometricVerified: chance(0.5) } });
        attMade++;
      }
    }
    day.setDate(day.getDate() + 1);
  }
  console.log(`Attendance: ${attMade} records added.`);
  // ── Profile portfolio (Part 7): fill empty sections only, ~70% of pool ──
  // Field names must match SECTION_EMPTY in employee-pages.tsx exactly.
  const roles = await db.role.findMany({ select: { id: true, name: true } });
  const roleNameOf = (e: Emp) => roles.find((r) => r.id === e.roleId)?.name ?? "";
  const isTeaching = (e: Emp) => /professor|dean/i.test(roleNameOf(e));
  const SCHOOLS = ["Holy Angel University", "Angeles University Foundation", "University of the Philippines Diliman", "Ateneo de Manila University", "Don Honorio Ventura State University"];
  const DEGREES = ["BS Computer Science", "BS Information Technology", "MS Computer Science", "MA Education", "BS Accountancy", "MBA", "PhD in Educational Management"];
  const SEMS = ["CHED Regional Research Colloquium", "Orial: AI in the Classroom", "PAASCU Self-Survey Workshop", "National e-Learning Summit", "In-House Pedagogy Retooling"];
  const ORGLIST = ["PAFTE", "PSITE Central Luzon", "PEMAP", "PICPA", "Philippine Statistical Association"];
  let profFilled = 0, profSkipped = 0;
  for (const e of shuffle(pool)) {
    const full = await db.employee.findUnique({ where: { id: e.id }, select: { profileData: true } });
    let cur: Record<string, unknown[]> = {};
    try { cur = full?.profileData ? JSON.parse(full.profileData) : {}; } catch { cur = {}; }
    const hasAny = ["education", "experience", "eligibility", "awards", "publications", "affiliations", "seminars", "accomplishments", "community"].some((k) => Array.isArray(cur[k]) && (cur[k] as unknown[]).length > 0);
    if (hasAny) { profSkipped++; continue; } // never overwrite hand-entered data
    if (full?.profileData) { profSkipped++; continue; } // any existing blob (even {"education":[]}) = touched, leave it
    if (!chance(0.7)) continue; // ~30% stay empty
    const teaching = isTeaching(e);
    const grad = int(2008, 2020);
    const built: Record<string, unknown[]> = {
      education: [
        { degree: pick(DEGREES), dateEarned: String(grad), school: pick(SCHOOLS) },
        ...(teaching && chance(0.6) ? [{ degree: "MS Computer Science", dateEarned: String(grad + int(3, 6)), school: pick(SCHOOLS) }] : []),
      ],
      experience: [
        { position: teaching ? "Instructor" : "Staff", year: `${grad + 1}-present`, organization: "Republic Central Colleges" },
      ],
      eligibility: teaching
        ? [{ exam: "Licensure Examination for Professional Teachers", place: "San Fernando, Pampanga", date: String(grad + 1), rating: `${int(78, 92)}.40` }]
        : [{ exam: "Civil Service Examination - Professional", place: "City of San Fernando", date: String(grad + 1), rating: `${int(80, 90)}.12` }],
      awards: teaching && chance(0.5) ? [{ award: "Outstanding Faculty", year: "2025", institution: "Republic Central Colleges" }] : [],
      publications: teaching && chance(0.5) ? [{ title: "Modular Learning in IT Education", publication: "RCC Research Journal", issue: "Vol. 4 (2025)" }] : [],
      affiliations: [{ organization: pick(ORGLIST), position: "Member", date: "2023-present" }],
      seminars: [{ title: pick(SEMS), scope: chance(0.5) ? "National" : "Regional", date: "2026", nature: chance(0.3) ? "Paper Presenter" : "Participant" }],
      accomplishments: chance(0.6) ? [{ function: "Foundation Anniversary", nature: "Working Committee" }] : [],
      community: chance(0.6) ? [{ title: "Brigada Eskwela", beneficiaries: "Sta. Teresita Elementary School", date: "2026", nature: "Volunteer" }] : [],
    };
    await db.employee.update({ data: { profileData: JSON.stringify(built) }, where: { id: e.id } });
    profFilled++;
  }
  console.log(`Profile portfolio: ${profFilled} filled, ${profSkipped} already had data (left alone).`);
  // ── Coverage report: prove the gaps ──
  const cov = [];
  for (const e of pool) {
    const [lr, fp, at] = await Promise.all([
      db.leaveRequest.count({ where: { employeeId: e.id } }),
      db.fpasSubmission.count({ where: { employeeId: e.id } }),
      db.attendance.count({ where: { employeeId: e.id } }),
    ]);
    cov.push(`${e.employeeId} leaves=${lr} fpas=${fp} attend=${at}${!isEligible(e) ? " (ineligible)" : ""}`);
  }
  console.log("\nCoverage (pool):\n  " + cov.join("\n  "));
  await db.systemSetting.upsert({ where: { key: SENTINEL }, update: { value: `seed=${SEED} ran=${new Date().toISOString()}` }, create: { key: SENTINEL, value: `seed=${SEED} ran=${new Date().toISOString()}`, category: "demo" } });
  console.log("\nDone. Re-run is safe (skips existing rows).");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());






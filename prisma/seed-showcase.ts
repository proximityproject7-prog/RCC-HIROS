// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Showcase Dataset Seed (session-38)
// Backfills a full school year of reportable history so Reports,
// trends, exports, leave queues, evaluations, and FPAS show their
// full capabilities. ADDITIVE + IDEMPOTENT: existing rows are never
// touched (unique-key guards everywhere); reruns only fill gaps.
// Fixed RNG seed → identical rows on every run.
// Run: npm run db:seed:showcase
// ═══════════════════════════════════════════════════════════════
import { db } from "../src/lib/db";

const RNG_SEED = "rcc-showcase-01";
const SCHOOL_YEAR = "2026-2027";
const CAMPUS = { lat: 15.1428, lng: 120.5886 };

// School-year window: Oct 1 2025 → Oct 9 2026 (today), weekdays only.
const WIN_START = new Date("2025-10-01T00:00:00");
const WIN_END = new Date("2026-10-09T00:00:00");

// ── Seeded RNG ──
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
const rand = mulberry32(hashSeed(RNG_SEED));
const chance = (p: number): boolean => rand() < p;
const int = (min: number, max: number): number => min + Math.floor(rand() * (max - min + 1));
const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function computeWorkdays(start: Date, end: Date): number {
  let n = 0; const c = new Date(start);
  while (c <= end) { const d = c.getDay(); if (d !== 0 && d !== 6) n++; c.setDate(c.getDate() + 1); }
  return Math.max(1, n);
}
function schoolDays(): Date[] {
  const out: Date[] = [];
  const c = new Date(WIN_START);
  while (c <= WIN_END) {
    const d = c.getDay();
    if (d !== 0 && d !== 6) out.push(new Date(c));
    c.setDate(c.getDate() + 1);
  }
  return out;
}

interface Emp {
  id: string; employeeId: string; firstName: string; lastName: string;
  groupId: string | null; groupName: string | null; roleId: string | null; roleName: string;
}

async function main() {
  console.log(`=== SHOWCASE SEED (${RNG_SEED}) ===\n`);
  const days = schoolDays();
  console.log(`Window: ${days.length} school days (Oct 2025 → Oct 2026, weekdays).`);

  const employees = await db.employee.findMany({
    where: { active: true },
    include: { group: true, role: true },
    orderBy: { employeeId: "asc" },
  });
  // System admin excluded (never clocks in); everyone else participates.
  const pool: Emp[] = employees
    .filter((e) => e.employeeId !== "EMP-0000")
    .map((e) => ({
      id: e.id, employeeId: e.employeeId, firstName: e.firstName, lastName: e.lastName,
      groupId: e.groupId, groupName: e.group?.name ?? null, roleId: e.roleId, roleName: e.role?.name ?? "",
    }));
  console.log(`Employees in pool: ${pool.length}`);

  // ── Approved-leave map (attendance skips leave days) ──
  const approved = await db.leaveRequest.findMany({
    where: { status: "approved" },
    select: { employeeId: true, startDate: true, endDate: true },
  });
  const leaveDays = new Set<string>();
  for (const l of approved) {
    const c = new Date(l.startDate);
    const end = new Date(l.endDate);
    while (c <= end) {
      leaveDays.add(`${l.employeeId}|${c.toISOString().slice(0, 10)}`);
      c.setDate(c.getDate() + 1);
    }
  }

  // ── 1. Attendance backfill ──
  // Per-employee presence profile cycles (98/95/92/88%) for visible variance.
  const profiles = [0.98, 0.95, 0.92, 0.88];
  let attMade = 0, attSkipped = 0;
  const admin = await db.employee.findFirst({ where: { role: { isSystem: true } }, select: { id: true } });
  for (let i = 0; i < pool.length; i++) {
    const e = pool[i];
    const presence = profiles[i % profiles.length];
    for (const day of days) {
      const dateKey = day.toISOString().slice(0, 10);
      if (leaveDays.has(`${e.id}|${dateKey}`)) continue; // on approved leave
      // Slot-scoped RNG: decisions depend ONLY on (seed, employee, date),
      // never on stream position — reruns pick the same days.
      const sr = mulberry32(hashSeed(`${RNG_SEED}|${e.employeeId}|${dateKey}`));
      const schance = (p: number): boolean => sr() < p;
      const sint = (min: number, max: number): number => min + Math.floor(sr() * (max - min + 1));
      if (sr() > presence) continue; // absent — no record (the interesting gap)
      const dStart = new Date(day); dStart.setHours(0, 0, 0, 0);
      const ex = await db.attendance.findUnique({
        where: { employeeId_date: { employeeId: e.id, date: dStart } },
      });
      if (ex) { attSkipped++; continue; }

      const late = schance(0.1);
      const inAt = new Date(day);
      inAt.setHours(late ? 8 : 7, late ? sint(6, 40) : sint(30, 59), 0, 0);
      const hasOut = schance(0.97);
      const outAt = new Date(day);
      outAt.setHours(17, sint(0, 40), 0, 0);
      const offPrem = schance(0.02);
      const jLat = offPrem ? CAMPUS.lat + 0.012 : CAMPUS.lat;
      const jLng = offPrem ? CAMPUS.lng + 0.012 : CAMPUS.lng;
      const edited = schance(0.02);

      await db.attendance.create({
        data: {
          employeeId: e.id,
          date: dStart,
          clockInAt: inAt,
          clockInLat: jLat, clockInLng: jLng,
          clockInOnPremise: !offPrem,
          clockInDistance: offPrem ? 1350 : 0,
          clockOutAt: hasOut ? outAt : null,
          clockOutLat: hasOut ? jLat : null, clockOutLng: hasOut ? jLng : null,
          clockOutOnPremise: hasOut ? !offPrem : null,
          clockOutDistance: hasOut ? (offPrem ? 1350 : 0) : null,
          biometricVerified: schance(0.6),
          manuallyEdited: edited,
          editedById: edited ? admin?.id ?? null : null,
          editRemarks: edited ? "Showcase: corrected forgotten clock-out" : null,
        },
      });
      attMade++;
    }
  }
  console.log(`Attendance: ${attMade} created, ${attSkipped} already existed (kept).`);

  // ── 2. Leave requests (~25, spread Jan–Sep 2026) ──
  const types = await db.leaveType.findMany();
  const typeByCode = Object.fromEntries(types.map((t) => [t.code, t]));
  const VL = typeByCode["VL"] ?? types[0];
  const SL = typeByCode["SL"] ?? types[0];
  const EL = typeByCode["EL"] ?? types[0];
  const perms = await db.rolePermission.findMany();
  const roleHas = (roleId: string | null, perm: string) =>
    !!roleId && perms.some((p) => p.roleId === roleId && p.identifier === perm && p.granted);
  const L1 = pool.filter((e) => roleHas(e.roleId, "leave.approve_l1"));
  const L2 = pool.filter((e) => roleHas(e.roleId, "leave.approve_l2"));
  const reasons = [
    "Family event out of town", "Medical check-up and rest", "Attending a wedding",
    "Home repairs and errands", "Child's school activity", "Fever and flu recovery",
    "Dental procedure", "Family emergency", "Board exam review", "Graduation ceremony",
  ];
  const existingNos = new Set((await db.leaveRequest.findMany({ select: { requestNo: true } })).map((r) => r.requestNo));
  let noSeq = 15;
  const nextNo = () => {
    let n = `LR-${String(noSeq).padStart(4, "0")}`;
    while (existingNos.has(n)) { noSeq++; n = `LR-${String(noSeq).padStart(4, "0")}`; }
    existingNos.add(n); noSeq++; return n;
  };
  const demoCount = await db.auditLog.count({ where: { action: "Create Leave Request", metadata: { contains: "showcase-01" } } });
  let lrMade = 0;
  if (demoCount > 0) {
    console.log("Leave: skipped (showcase requests already seeded).");
  } else {
    const base = new Date("2026-01-05T00:00:00");
    const addDays = (d: Date, n: number) => { const c = new Date(d); c.setDate(c.getDate() + n); return c; };
    for (const e of shuffle(pool)) {
      if (!chance(0.75)) continue;
      const nReq = chance(0.6) ? 1 : 2;
      for (let k = 0; k < nReq; k++) {
        const t = chance(0.5) ? VL : chance(0.6) ? SL : EL;
        const start = addDays(base, int(5, 265));
        const end = addDays(start, chance(0.7) ? int(0, 1) : int(2, 4));
        const workdays = computeWorkdays(start, end);
        // Recent requests stay pending (live queue); older ones resolved.
        const recent = start > new Date("2026-09-15T00:00:00");
        const outcome = recent
          ? (chance(0.5) ? "pending_l1" : "pending_l2")
          : (chance(0.6) ? "approved" : chance(0.5) ? "rejected" : "cancelled");
        const l1 = pick(L1.filter((a) => a.id !== e.id).length > 0 ? L1.filter((a) => a.id !== e.id) : L1);
        const l2 = pick(L2.filter((a) => a.id !== e.id && a.id !== l1.id).length > 0 ? L2.filter((a) => a.id !== e.id && a.id !== l1.id) : L2);
        const req = await db.leaveRequest.create({
          data: {
            requestNo: nextNo(), employeeId: e.id, leaveTypeId: t.id,
            startDate: start, endDate: end, workdays,
            reason: pick(reasons), status: outcome,
          },
        });
        lrMade++;
        await db.auditLog.create({
          data: { userId: e.id, action: "Create Leave Request", entity: "LeaveRequest", entityId: req.id, metadata: JSON.stringify({ requestNo: req.requestNo, showcase: "showcase-01" }) },
        });
        if (outcome === "pending_l2" || outcome === "approved") {
          await db.leaveApproval.create({ data: { leaveRequestId: req.id, level: 1, approverId: l1.id, status: "approved", remarks: "Verified. Forwarded.", actedAt: addDays(start, -3) } });
        }
        if (outcome === "approved") {
          await db.leaveApproval.create({ data: { leaveRequestId: req.id, level: 2, approverId: l2.id, status: "approved", remarks: "Approved.", actedAt: addDays(start, -2) } });
          const bal = await db.leaveBalance.findUnique({
            where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: t.id, year: start.getFullYear() } },
          });
          if (bal) await db.leaveBalance.update({ where: { id: bal.id }, data: { usedDays: bal.usedDays + workdays } });
        }
        if (outcome === "rejected") {
          await db.leaveApproval.create({ data: { leaveRequestId: req.id, level: 1, approverId: l1.id, status: "rejected", remarks: "Insufficient staffing on requested dates.", actedAt: addDays(start, -3) } });
        }
      }
    }
  }
  console.log(`Leave requests: ${lrMade} created.`);

  // ── 3. Evaluations: closed showcase period + varied submitted scores ──
  const livePeriod = await db.evaluationPeriod.findUnique({ where: { id: "eval-period-1s-2026" } });
  const form = await db.evaluationForm.findFirst({
    where: livePeriod ? { id: livePeriod.formId } : {},
    include: { criteria: true },
  });
  if (!form || form.criteria.length === 0) throw new Error("No evaluation form/criteria found — run base seed first.");
  const criteria = [...form.criteria].sort((a, b) => a.sortOrder - b.sortOrder);
  let showcasePeriod = await db.evaluationPeriod.findUnique({ where: { id: "eval-period-showcase-2526" } });
  if (!showcasePeriod) {
    showcasePeriod = await db.evaluationPeriod.create({
      data: {
        id: "eval-period-showcase-2526",
        formId: form.id,
        name: "Summer Showcase 2026",
        startDate: new Date("2026-04-01T00:00:00.000Z"),
        endDate: new Date("2026-05-31T00:00:00.000Z"),
        status: "closed", // closed = never interferes with the live open period
      },
    });
  }
  const deans = pool.filter((e) => /dean/i.test(e.roleName));
  const faculty = pool.filter((e) => /professor/i.test(e.roleName));
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  let evMade = 0;
  for (const f of faculty) {
    const evaluator = deans.find((d) => d.groupId === f.groupId && d.id !== f.id) ?? deans.find((d) => d.id !== f.id) ?? pool.find((p) => p.id !== f.id)!;
    const exists = await db.evaluation.findUnique({
      where: { periodId_evaluatorId_employeeId: { periodId: showcasePeriod.id, evaluatorId: evaluator.id, employeeId: f.id } },
    });
    if (exists) continue;
    const targetAvg = [3.6, 4.0, 4.2, 4.5, 4.7][Math.floor(rand() * 5)];
    const targetSum = Math.round(targetAvg * criteria.length);
    const scores: number[] = Array(criteria.length).fill(Math.floor(targetAvg));
    let sum = Math.floor(targetAvg) * criteria.length;
    let guard = 0;
    while (sum < targetSum && guard++ < 100) {
      const i = Math.floor(rand() * criteria.length);
      if (scores[i] < 5) { scores[i]++; sum++; }
    }
    const totalScore = Number((criteria.reduce((s, c, i) => s + c.weight * scores[i], 0) / totalWeight).toFixed(2));
    await db.evaluation.create({
      data: {
        periodId: showcasePeriod.id, formId: form.id,
        evaluatorId: evaluator.id, employeeId: f.id,
        status: "submitted", totalScore,
        remarks: "Showcase evaluation — demonstrates score distribution across criteria.",
        submittedAt: new Date("2026-05-20T10:00:00.000Z"),
        responses: { create: criteria.map((c, i) => ({ criterionId: c.id, score: scores[i], comments: i % 3 === 0 ? "Consistently performs well in this area." : null })) },
      },
    });
    evMade++;
  }
  console.log(`Evaluations: ${evMade} submitted in closed showcase period.`);

  // ── 4. FPAS: fill the 5 missing 2026-2027 submissions (tiered forms) ──
  let rowSeq = 1;
  const mkRow = (title: string, nature: string, points: number, extra?: Record<string, string>) => ({
    id: `showcase-r${rowSeq++}-${Math.floor(rand() * 1e6).toString(36)}`, title, nature, points, ...(extra ?? {}),
  });
  const SEMINARS = ["CHED Regional Research Colloquium", "Orial: AI in the Classroom", "PAASCU Self-Survey Workshop", "In-House Pedagogy Retooling", "National e-Learning Summit"];
  let fpasMade = 0;
  const missing = await db.employee.findMany({
    where: {
      active: true,
      role: { name: { contains: "professor" } },
      fpasSubmissions: { none: { schoolYear: SCHOOL_YEAR } },
    },
    include: { group: true, role: true },
  });
  for (const e of missing) {
    const mid = chance(0.6);
    const pv = (m: number, l: number) => (mid ? m : l);
    const fd = {
      header: { name: `${e.firstName} ${e.lastName}`, department: e.group?.name ?? "", dateEnteredRcc: "2019-06-01", degreeInstitution: "Holy Angel University", schoolYear: SCHOOL_YEAR },
      criteria1: { studentEvaluation: pv(5, 4), classroomPerformance: pv(5, 4), gradeSubmission: 2, gradeAccuracy: mid ? 1 : 0, classRecordSubmission: 1, gradingSheetSubmission: 1, syllabiSubmission: pv(2, 1), syllabiFormat: true, syllabiObjectives: mid, syllabiReferences: false, testPaperSubmission: 1, testItemQuality: pv(2, 1), testAdministration: 1 },
      criteria2: { absences: pv(5, 4), tardiness: pv(4, 3), schoolActivities: pv(3, 2), facultyMeetings: pv(2, 2), libraryVisits: pv(2, 1) },
      criteria3: {
        graduateDegree: mid ? [mkRow("MIT units (24)", "Angeles University Foundation", 4, { institution: "Angeles University Foundation" })] : [],
        facultyDevelopment: mid ? [mkRow(pick(SEMINARS), "Participant", 2)] : [],
        seminars: mid && chance(0.6) ? [mkRow(pick(SEMINARS), "Participant", 1)] : [],
        specialStudies: [],
        awards: [],
        professionalOrgs: mid && chance(0.5) ? [mkRow("PSITE Central Luzon", "Member", 1, { institution: "3" })] : [],
      },
      criteria4: {
        discoveries: [],
        publications: mid && chance(0.4) ? [mkRow("Classroom Action Research Notes", "Author", 2)] : [],
        researchStudies: [],
        researchArticles: [],
      },
      criteria5: {
        adviser: mid ? [mkRow("JPCS Chapter", "2026-2027", 2)] : [],
        coach: [],
        officialFunctions: chance(0.6) ? [mkRow("Foundation Anniversary", "Working Committee", 1)] : [],
      },
      criteria6: {
        projectsInitiated: [],
        projectsParticipated: chance(0.6) ? [mkRow(pick(["Brigada Eskwela", "Feeding Program"]), "Volunteer", 2)] : [],
        memberships: [],
      },
    };
    // Total mirrors calculateTotal caps (c1/25, c2/20, c3/20, c4/16, c5/9, c6/10).
    const c1 = fd.criteria1.studentEvaluation + fd.criteria1.classroomPerformance + fd.criteria1.gradeSubmission + fd.criteria1.gradeAccuracy + fd.criteria1.classRecordSubmission + fd.criteria1.gradingSheetSubmission + fd.criteria1.syllabiSubmission + (fd.criteria1.syllabiFormat ? 0.5 : 0) + (fd.criteria1.syllabiObjectives ? 1 : 0) + (fd.criteria1.syllabiReferences ? 0.5 : 0) + fd.criteria1.testPaperSubmission + fd.criteria1.testItemQuality + fd.criteria1.testAdministration;
    const c2 = fd.criteria2.absences + fd.criteria2.tardiness + fd.criteria2.schoolActivities + fd.criteria2.facultyMeetings + fd.criteria2.libraryVisits;
    const sumRows = (rows: { points: number }[]) => rows.reduce((a, r) => a + (Number(r.points) || 0), 0);
    // Same cap math as the app's calculateTotal.
    const capT = (rows: { points: number }[], m?: number) => (m === undefined ? sumRows(rows) : Math.min(sumRows(rows), m));
    const cc3 = Math.min(capT(fd.criteria3.graduateDegree, 9) + capT(fd.criteria3.facultyDevelopment, 4) + capT(fd.criteria3.seminars, 3) + sumRows(fd.criteria3.specialStudies) + capT(fd.criteria3.awards, 4) + capT(fd.criteria3.professionalOrgs, 3), 20);
    const cc4 = Math.min(capT(fd.criteria4.discoveries, 7) + sumRows(fd.criteria4.publications) + capT(fd.criteria4.researchStudies, 5) + capT(fd.criteria4.researchArticles, 4), 16);
    const cc5 = Math.min(capT(fd.criteria5.adviser, 3) + capT(fd.criteria5.coach, 3) + capT(fd.criteria5.officialFunctions, 3), 9);
    const cc6 = Math.min(capT(fd.criteria6.projectsInitiated, 4) + capT(fd.criteria6.projectsParticipated, 3) + capT(fd.criteria6.memberships, 3), 10);
    const total = Math.min(Math.min(c1, 25) + Math.min(c2, 20) + cc3 + cc4 + cc5 + cc6, 100);
    await db.fpasSubmission.create({
      data: { employeeId: e.id, schoolYear: SCHOOL_YEAR, formData: JSON.stringify(fd), totalPoints: total },
    });
    fpasMade++;
  }
  console.log(`FPAS: ${fpasMade} submissions added for ${SCHOOL_YEAR}.`);

  // ── Coverage summary ──
  const [att, lr, ev, fp] = await Promise.all([
    db.attendance.count(), db.leaveRequest.count(), db.evaluation.count(), db.fpasSubmission.count(),
  ]);
  console.log(`\nTotals now: attendance=${att} leaves=${lr} evaluations=${ev} fpas=${fp}`);
  console.log("Done. Re-run is safe (skips existing rows).");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

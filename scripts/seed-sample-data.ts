import { db } from "../src/lib/db";

const YEAR = 2026;

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dayTime(daysOffset: number, hours: number, minutes = 0): Date {
  const d = daysFromNow(daysOffset);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding sample data...\n");

  // ═════════════════════════════════════════════════════════════
  // 0. Look up existing employees
  // ═════════════════════════════════════════════════════════════
  const admin = await db.employee.findUnique({ where: { employeeId: "EMP-0000" } });
  const jeremiah = await db.employee.findUnique({ where: { employeeId: "EMP-0001" } });
  const neil = await db.employee.findUnique({ where: { employeeId: "EMP-0003" } });
  const asgar = await db.employee.findUnique({ where: { employeeId: "EMP-0009" } });

  if (!admin || !jeremiah || !neil || !asgar) {
    console.error("Missing employees. Run seed-3users.ts first.");
    process.exit(1);
  }

  console.log("Found employees:");
  console.log(`  ${admin.employeeId} ${admin.firstName} ${admin.lastName}`);
  console.log(`  ${jeremiah.employeeId} ${jeremiah.firstName} ${jeremiah.lastName}`);
  console.log(`  ${neil.employeeId} ${neil.firstName} ${neil.lastName}`);
  console.log(`  ${asgar.employeeId} ${asgar.firstName} ${asgar.lastName}`);

  // ═════════════════════════════════════════════════════════════
  // 1. Leave Types
  // ═════════════════════════════════════════════════════════════
  console.log("\nCreating leave types...");
  const sickLeave = await db.leaveType.upsert({
    where: { code: "SL" },
    update: { name: "Sick Leave", defaultDays: 10, active: true },
    create: { name: "Sick Leave", code: "SL", defaultDays: 10, active: true },
  });
  const vacationLeave = await db.leaveType.upsert({
    where: { code: "VL" },
    update: { name: "Vacation Leave", defaultDays: 15, active: true },
    create: { name: "Vacation Leave", code: "VL", defaultDays: 15, active: true },
  });
  const emergencyLeave = await db.leaveType.upsert({
    where: { code: "EL" },
    update: { name: "Emergency Leave", defaultDays: 5, active: true },
    create: { name: "Emergency Leave", code: "EL", defaultDays: 5, active: true },
  });
  console.log("  Sick Leave, Vacation Leave, Emergency Leave");

  // ═════════════════════════════════════════════════════════════
  // 2. Leave Balances
  // ═════════════════════════════════════════════════════════════
  console.log("Creating leave balances...");
  await db.leaveBalance.deleteMany({});
  const allEmps = [admin, jeremiah, neil, asgar];
  const leaveTypes = [sickLeave, vacationLeave, emergencyLeave];
  const usedDays: Record<string, Record<string, number>> = {
    "EMP-0000": { SL: 0, VL: 0, EL: 0 },
    "EMP-0001": { SL: 2, VL: 3, EL: 0 },
    "EMP-0003": { SL: 1, VL: 5, EL: 0 },
    "EMP-0009": { SL: 4, VL: 2, EL: 1 },
  };

  for (const emp of allEmps) {
    for (const lt of leaveTypes) {
      const used = usedDays[emp.employeeId]?.[lt.code] ?? 0;
      await db.leaveBalance.create({
        data: {
          employeeId: emp.id,
          leaveTypeId: lt.id,
          year: YEAR,
          totalDays: lt.defaultDays,
          usedDays: used,
        },
      });
    }
  }
  console.log("  Balances created for all 4 employees");

  // ═════════════════════════════════════════════════════════════
  // 3. Leave Requests (showcase all workflow states)
  // ═════════════════════════════════════════════════════════════
  console.log("Creating leave requests...");
  await db.leaveApproval.deleteMany({});
  await db.leaveRequest.deleteMany({});

  // LR-0001: Asgar — Vacation Leave — Pending L1 (awaiting Neil)
  const lr1 = await db.leaveRequest.create({
    data: {
      requestNo: "LR-0001",
      employeeId: asgar.id,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(7),
      endDate: daysFromNow(9),
      workdays: 3,
      reason: "Family reunion in the province — planning to visit relatives.",
      status: "pending_l1",
    },
  });
  await db.leaveApproval.create({
    data: { leaveRequestId: lr1.id, level: 1, approverId: neil.id, status: "pending" },
  });

  // LR-0002: Asgar — Sick Leave — Approved (Neil L1 + Jeremiah L2)
  const lr2 = await db.leaveRequest.create({
    data: {
      requestNo: "LR-0002",
      employeeId: asgar.id,
      leaveTypeId: sickLeave.id,
      startDate: daysFromNow(-10),
      endDate: daysFromNow(-9),
      workdays: 2,
      reason: "Doctor advised bed rest due to high fever and flu.",
      status: "approved",
    },
  });
  await db.leaveApproval.create({
    data: {
      leaveRequestId: lr2.id, level: 1, approverId: neil.id,
      status: "approved", remarks: "Approved — take care.", actedAt: dayTime(-11, 10, 0),
    },
  });
  await db.leaveApproval.create({
    data: {
      leaveRequestId: lr2.id, level: 2, approverId: jeremiah.id,
      status: "approved", remarks: "Approved — noted.", actedAt: dayTime(-11, 14, 30),
    },
  });

  // LR-0003: Neil — Vacation Leave — Approved (Jeremiah L2)
  const lr3 = await db.leaveRequest.create({
    data: {
      requestNo: "LR-0003",
      employeeId: neil.id,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(-20),
      endDate: daysFromNow(-18),
      workdays: 3,
      reason: "Attending a education conference in Manila.",
      status: "approved",
    },
  });
  await db.leaveApproval.create({
    data: {
      leaveRequestId: lr3.id, level: 2, approverId: jeremiah.id,
      status: "approved", remarks: "Approved — conference is work-related.", actedAt: dayTime(-21, 9, 0),
    },
  });

  // LR-0004: Jeremiah — Emergency Leave — Approved (self)
  const lr4 = await db.leaveRequest.create({
    data: {
      requestNo: "LR-0004",
      employeeId: jeremiah.id,
      leaveTypeId: emergencyLeave.id,
      startDate: daysFromNow(-30),
      endDate: daysFromNow(-30),
      workdays: 1,
      reason: "Family emergency — urgent household matter.",
      status: "approved",
    },
  });
  await db.leaveApproval.create({
    data: {
      leaveRequestId: lr4.id, level: 2, approverId: jeremiah.id,
      status: "approved", remarks: "Self-approved (HR role).", actedAt: dayTime(-30, 8, 0),
    },
  });

  // LR-0005: Asgar — Sick Leave — Rejected by Neil
  const lr5 = await db.leaveRequest.create({
    data: {
      requestNo: "LR-0005",
      employeeId: asgar.id,
      leaveTypeId: sickLeave.id,
      startDate: daysFromNow(-40),
      endDate: daysFromNow(-40),
      workdays: 1,
      reason: "Not feeling well.",
      status: "rejected",
    },
  });
  await db.leaveApproval.create({
    data: {
      leaveRequestId: lr5.id, level: 1, approverId: neil.id,
      status: "rejected", remarks: "Insufficient detail. Please provide a medical certificate.", actedAt: dayTime(-41, 15, 0),
    },
  });

  // LR-0006: Jeremiah — Vacation Leave — Draft (not submitted)
  await db.leaveRequest.create({
    data: {
      requestNo: "LR-0006",
      employeeId: jeremiah.id,
      leaveTypeId: vacationLeave.id,
      startDate: daysFromNow(20),
      endDate: daysFromNow(24),
      workdays: 5,
      reason: "Planned vacation — still finalizing dates.",
      status: "draft",
    },
  });

  console.log("  6 leave requests created (all workflow states)");

  // ═════════════════════════════════════════════════════════════
  // 4. Evaluation Form + Criteria
  // ═════════════════════════════════════════════════════════════
  console.log("Creating evaluation form + criteria...");
  const evalForm = await db.evaluationForm.upsert({
    where: { id: "eval-form-faculty-2026" },
    update: { name: "Faculty Evaluation 2026", version: 1, active: true },
    create: { id: "eval-form-faculty-2026", name: "Faculty Evaluation 2026", version: 1, active: true },
  });

  const criteriaDefs: Array<{ category: string; description: string; sortOrder: number }> = [
    { category: "I. Communication Skills", description: "Pronounces words clearly and distinctly.", sortOrder: 1 },
    { category: "I. Communication Skills", description: "Speaks clearly enough to be understood easily.", sortOrder: 2 },
    { category: "I. Communication Skills", description: "Has good command of English or Filipino.", sortOrder: 3 },
    { category: "I. Communication Skills", description: "Has a well-modulated voice.", sortOrder: 4 },
    { category: "II. Instructional Skills", description: "Uses a variety of methods and techniques to facilitate learning.", sortOrder: 5 },
    { category: "II. Instructional Skills", description: "Presents the subject matter clearly and systematically.", sortOrder: 6 },
    { category: "II. Instructional Skills", description: "Adjusts to the students' learning pace.", sortOrder: 7 },
    { category: "II. Instructional Skills", description: "Provokes critical, creative, and reflective thinking.", sortOrder: 8 },
    { category: "II. Instructional Skills", description: "Encourages students' active participation.", sortOrder: 9 },
    { category: "II. Instructional Skills", description: "Uses teaching aids like illustrations, diagrams, etc.", sortOrder: 10 },
    { category: "II. Instructional Skills", description: "Elicits correct responses through skillful questioning.", sortOrder: 11 },
    { category: "III. Knowledge of Subject-Matter", description: "Discusses the lesson with mastery.", sortOrder: 12 },
    { category: "III. Knowledge of Subject-Matter", description: "Follows the course syllabus.", sortOrder: 13 },
    { category: "III. Knowledge of Subject-Matter", description: "Relates subject matter to other subjects.", sortOrder: 14 },
    { category: "III. Knowledge of Subject-Matter", description: "Relates to the vision, mission, and objectives of the college.", sortOrder: 15 },
    { category: "III. Knowledge of Subject-Matter", description: "Integrates values in the lessons.", sortOrder: 16 },
    { category: "IV. Classroom Management", description: "Maintains class discipline.", sortOrder: 17 },
    { category: "IV. Classroom Management", description: "Room is clean and orderly.", sortOrder: 18 },
    { category: "IV. Classroom Management", description: "Comes to class on time.", sortOrder: 19 },
    { category: "IV. Classroom Management", description: "Dismisses class on time.", sortOrder: 20 },
    { category: "IV. Classroom Management", description: "Is always present in class.", sortOrder: 21 },
    { category: "IV. Classroom Management", description: "Enforces school rules consistently.", sortOrder: 22 },
    { category: "V. Professional Qualities", description: "Respects students' opinions.", sortOrder: 23 },
    { category: "V. Professional Qualities", description: "Maintains good working relations with students.", sortOrder: 24 },
    { category: "V. Professional Qualities", description: "Is fair in giving grades.", sortOrder: 25 },
    { category: "V. Professional Qualities", description: "Is firm and consistent but reasonable.", sortOrder: 26 },
    { category: "V. Professional Qualities", description: "Returns corrected papers promptly.", sortOrder: 27 },
    { category: "VI. Personal Qualities", description: "Dresses neatly and appropriately.", sortOrder: 28 },
    { category: "VI. Personal Qualities", description: "Demonstrates calmness and poise.", sortOrder: 29 },
    { category: "VI. Personal Qualities", description: "Is physically and mentally fit to teach.", sortOrder: 30 },
    { category: "VII. Classwork Design", description: "Presents an instructional plan geared towards learning outcomes.", sortOrder: 31 },
    { category: "VII. Classwork Design", description: "Uses modules to organize classwork content.", sortOrder: 32 },
    { category: "VII. Classwork Design", description: "Provides equal access of learning materials.", sortOrder: 33 },
    { category: "VII. Classwork Design", description: "Organizes assignments and due dates.", sortOrder: 34 },
  ];

  await db.evaluationCriterion.deleteMany({ where: { formId: evalForm.id } });
  const createdCriteria = [];
  for (const c of criteriaDefs) {
    const criterion = await db.evaluationCriterion.create({
      data: { formId: evalForm.id, category: c.category, description: c.description, maxScore: 5, weight: 1.0, sortOrder: c.sortOrder },
    });
    createdCriteria.push(criterion);
  }
  console.log(`  Form: ${evalForm.name} (${createdCriteria.length} criteria)`);

  // ═════════════════════════════════════════════════════════════
  // 5. Evaluation Periods
  // ═════════════════════════════════════════════════════════════
  console.log("Creating evaluation periods...");
  const closedPeriod = await db.evaluationPeriod.create({
    data: {
      id: "eval-period-2s-2025",
      formId: evalForm.id,
      name: "2nd Semester 2025",
      startDate: new Date("2025-11-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      status: "closed",
    },
  });
  const openPeriod = await db.evaluationPeriod.create({
    data: {
      id: "eval-period-1s-2026",
      formId: evalForm.id,
      name: "1st Semester 2026",
      startDate: new Date("2026-06-01T00:00:00.000Z"),
      endDate: new Date("2026-10-31T00:00:00.000Z"),
      status: "open",
    },
  });
  console.log(`  ${closedPeriod.name} (closed), ${openPeriod.name} (open)`);

  // ═════════════════════════════════════════════════════════════
  // 6. Evaluation Submissions
  // ═════════════════════════════════════════════════════════════
  console.log("Creating evaluations...");

  async function createEvaluation(
    periodId: string, employeeId: string, evaluatorId: string,
    targetAvg: number, remarks: string | null, submitted: boolean, submittedDate?: Date
  ) {
    const count = createdCriteria.length;
    const targetSum = Math.round(targetAvg * count);
    const scores: number[] = Array(count).fill(Math.floor(targetAvg));
    let currentSum = Math.floor(targetAvg) * count;
    while (currentSum < targetSum) {
      const idx = Math.floor(Math.random() * count);
      if (scores[idx] < 5) { scores[idx]++; currentSum++; }
    }
    while (currentSum > targetSum) {
      const idx = Math.floor(Math.random() * count);
      if (scores[idx] > 1) { scores[idx]--; currentSum--; }
    }
    for (let i = scores.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [scores[i], scores[j]] = [scores[j], scores[i]];
    }
    const totalWeight = createdCriteria.reduce((s, c) => s + c.weight, 0);
    const weightedSum = createdCriteria.reduce((s, c, i) => s + c.weight * scores[i], 0);
    const totalScore = Number((weightedSum / totalWeight).toFixed(2));

    return db.evaluation.create({
      data: {
        periodId, formId: evalForm.id, evaluatorId, employeeId,
        status: submitted ? "submitted" : "draft",
        totalScore: submitted ? totalScore : null,
        remarks,
        submittedAt: submitted ? submittedDate ?? new Date() : null,
        responses: {
          create: createdCriteria.map((c, i) => ({
            criterionId: c.id, score: scores[i],
            comments: i % 3 === 0 ? "Consistently performs well." : null,
          })),
        },
      },
    });
  }

  // Neil → Asgar (closed period, submitted)
  await createEvaluation(closedPeriod.id, asgar.id, neil.id, 4.0,
    "Asgar demonstrates solid teaching fundamentals. Needs to improve on classroom management techniques.",
    true, new Date("2026-03-15T10:00:00.000Z"));

  // Neil → Asgar (open period, submitted)
  await createEvaluation(openPeriod.id, asgar.id, neil.id, 4.2,
    "Significant improvement observed this semester. Student engagement has increased. Keep up the good work.",
    true, dayTime(-10, 14, 0));

  // Jeremiah → Asgar (open period, draft — not yet submitted)
  await createEvaluation(openPeriod.id, asgar.id, jeremiah.id, 3.8, null, false);

  console.log("  3 evaluations created (1 submitted closed, 1 submitted open, 1 draft)");

  // ═════════════════════════════════════════════════════════════
  // 7. Attendance Records (5 days)
  // ═════════════════════════════════════════════════════════════
  console.log("Creating attendance records...");
  await db.attendance.deleteMany({});
  const campusLat = 15.1428;
  const campusLng = 120.5886;

  const attendanceData: Array<[number, string, number, number, boolean, number, number]> = [
    [0, "EMP-0001", 7, 55, true, 17, 5],
    [0, "EMP-0003", 8, 10, false, 0, 0],
    [0, "EMP-0009", 8, 30, true, 17, 0],
    [-1, "EMP-0001", 7, 50, true, 17, 8],
    [-1, "EMP-0003", 8, 5, true, 17, 5],
    [-1, "EMP-0009", 8, 45, true, 16, 55],
    [-2, "EMP-0001", 7, 55, true, 17, 2],
    [-2, "EMP-0003", 8, 15, true, 17, 10],
    [-2, "EMP-0009", 9, 0, false, 0, 0],
    [-3, "EMP-0001", 8, 0, true, 17, 5],
    [-3, "EMP-0003", 8, 20, true, 17, 15],
    [-3, "EMP-0009", 8, 50, true, 17, 0],
    [-4, "EMP-0001", 7, 45, true, 17, 10],
    [-4, "EMP-0003", 8, 0, true, 17, 0],
    [-4, "EMP-0009", 8, 40, true, 16, 50],
  ];

  for (const [offset, empId, ciH, ciM, clockedOut, coH, coM] of attendanceData) {
    const emp = allEmps.find(e => e.employeeId === empId);
    if (!emp) continue;
    const recordDate = daysFromNow(offset);
    const clockInAt = new Date(recordDate);
    clockInAt.setHours(ciH, ciM, 0, 0);
    const record: Record<string, unknown> = {
      employeeId: emp.id, date: recordDate, clockInAt,
      clockInLat: campusLat, clockInLng: campusLng, clockInOnPremise: true, clockInDistance: 0,
      biometricVerified: true, manuallyEdited: false,
    };
    if (clockedOut) {
      const clockOutAt = new Date(recordDate);
      clockOutAt.setHours(coH, coM, 0, 0);
      record.clockOutAt = clockOutAt;
      record.clockOutLat = campusLat;
      record.clockOutLng = campusLng;
      record.clockOutOnPremise = true;
      record.clockOutDistance = 0;
    }
    await db.attendance.create({ data: record as never });
  }
  console.log(`  ${attendanceData.length} attendance records (5 days)`);

  // ═════════════════════════════════════════════════════════════
  // 8. Employee Certificates
  // ═════════════════════════════════════════════════════════════
  console.log("Creating employee certificates...");
  await db.employeeCertificate.deleteMany({});
  const certs = [
    { empId: "EMP-0001", title: "Certified HR Professional", issuer: "Philippines HR Society", certNo: "PHRS-CHRP-2024-101", issueDate: new Date("2024-06-15") },
    { empId: "EMP-0001", title: "Labor Law Compliance Seminar", issuer: "DOLE Region III", certNo: "DOLE-LLC-2025-055", issueDate: new Date("2025-03-10") },
    { empId: "EMP-0003", title: "Educational Leadership Certificate", issuer: "CHED", certNo: "CHED-ELC-2024-032", issueDate: new Date("2024-09-20") },
    { empId: "EMP-0003", title: "Instructional Supervision Training", issuer: "DepEd Region III", certNo: "DEPED-IST-2025-018", issueDate: new Date("2025-01-15") },
    { empId: "EMP-0009", title: "Certified Java Developer", issuer: "Oracle University", certNo: "ORA-JAVA-2024-456", issueDate: new Date("2024-04-10") },
    { empId: "EMP-0009", title: "Teaching Excellence Award", issuer: "RCC Academic Council", certNo: "RCC-TEA-2025-012", issueDate: new Date("2025-06-20") },
    { empId: "EMP-0009", title: "Web Development Bootcamp", issuer: "Coursera / Google", certNo: "COU-WDB-2025-789", issueDate: new Date("2025-08-05") },
  ];
  for (const cert of certs) {
    const emp = allEmps.find(e => e.employeeId === cert.empId);
    if (!emp) continue;
    await db.employeeCertificate.create({
      data: {
        employeeId: emp.id, title: cert.title, issuer: cert.issuer,
        certificateNo: cert.certNo, issueDate: cert.issueDate,
      },
    });
  }
  console.log(`  ${certs.length} certificates created`);

  // ═════════════════════════════════════════════════════════════
  // 9. System Settings
  // ═════════════════════════════════════════════════════════════
  console.log("Creating system settings...");
  const premisesValue = JSON.stringify({
    lat: 15.1428, lng: 120.5886, radiusMeters: 200,
    label: "Republic Central Colleges — Angeles",
  });
  await db.systemSetting.upsert({
    where: { key: "premises_config" },
    update: { value: premisesValue, category: "attendance" },
    create: { key: "premises_config", value: premisesValue, category: "attendance" },
  });
  console.log("  Premises geofence config set");

  // ═════════════════════════════════════════════════════════════
  // Done
  // ═════════════════════════════════════════════════════════════
  console.log("\n========================================");
  console.log("  SAMPLE DATA SEED COMPLETE");
  console.log("========================================\n");
  console.log("Leave Requests:");
  console.log("  LR-0001 | Asgar     | Vacation | Pending L1 (awaiting Neil)");
  console.log("  LR-0002 | Asgar     | Sick     | Approved");
  console.log("  LR-0003 | Neil      | Vacation | Approved");
  console.log("  LR-0004 | Jeremiah  | Emergency| Approved");
  console.log("  LR-0005 | Asgar     | Sick     | Rejected");
  console.log("  LR-0006 | Jeremiah  | Vacation | Draft\n");
  console.log("Evaluations:");
  console.log("  Neil → Asgar (closed) | Submitted | ~4.0");
  console.log("  Neil → Asgar (open)   | Submitted | ~4.2");
  console.log("  Jeremiah → Asgar (open) | Draft   | —\n");
  console.log("Attendance: 15 records (5 days × 3 employees)");
  console.log("Certificates: 7 certificates across 3 employees");
  console.log("System: Premises geofence config");
}

main().catch(console.error).finally(() => db.$disconnect());

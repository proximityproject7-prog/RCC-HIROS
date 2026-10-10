// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — FPAS form data model + scoring engine (pure, no deps).
// Single source for the fill form, the print document, the PDF
// document, and the export/select UIs. Caps mirror the official
// instrument (total 100).
// ═══════════════════════════════════════════════════════════════

export interface DynamicRow {
  id: string;
  [key: string]: string | number | boolean;
}

export interface FpasFormData {
  header: {
    name: string;
    department: string;
    dateEnteredRcc: string;
    degreeInstitution: string;
    schoolYear: string;
  };
  criteria1: {
    studentEvaluation: number;
    classroomPerformance: number;
    gradeSubmission: number;
    gradeAccuracy: number;
    classRecordSubmission: number;
    gradingSheetSubmission: number;
    syllabiSubmission: number;
    syllabiFormat: boolean;
    syllabiObjectives: boolean;
    syllabiReferences: boolean;
    testPaperSubmission: number;
    testItemQuality: number;
    testAdministration: number;
  };
  criteria2: {
    absences: number;
    tardiness: number;
    schoolActivities: number;
    facultyMeetings: number;
    libraryVisits: number;
  };
  criteria3: {
    graduateDegree: DynamicRow[];
    facultyDevelopment: DynamicRow[];
    seminars: DynamicRow[];
    specialStudies: DynamicRow[];
    awards: DynamicRow[];
    professionalOrgs: DynamicRow[];
  };
  criteria4: {
    discoveries: DynamicRow[];
    publications: DynamicRow[];
    researchStudies: DynamicRow[];
    researchArticles: DynamicRow[];
  };
  criteria5: {
    adviser: DynamicRow[];
    coach: DynamicRow[];
    officialFunctions: DynamicRow[];
  };
  criteria6: {
    projectsInitiated: DynamicRow[];
    projectsParticipated: DynamicRow[];
    memberships: DynamicRow[];
  };
}

export function blankFpasForm(schoolYear: string): FpasFormData {
  return {
    header: { name: "", department: "", dateEnteredRcc: "", degreeInstitution: "", schoolYear },
    criteria1: {
      studentEvaluation: 0, classroomPerformance: 0, gradeSubmission: 0,
      gradeAccuracy: 0, classRecordSubmission: 0, gradingSheetSubmission: 0,
      syllabiSubmission: 0, syllabiFormat: false, syllabiObjectives: false,
      syllabiReferences: false, testPaperSubmission: 0, testItemQuality: 0,
      testAdministration: 0,
    },
    criteria2: { absences: 0, tardiness: 0, schoolActivities: 0, facultyMeetings: 0, libraryVisits: 0 },
    criteria3: { graduateDegree: [], facultyDevelopment: [], seminars: [], specialStudies: [], awards: [], professionalOrgs: [] },
    criteria4: { discoveries: [], publications: [], researchStudies: [], researchArticles: [] },
    criteria5: { adviser: [], coach: [], officialFunctions: [] },
    criteria6: { projectsInitiated: [], projectsParticipated: [], memberships: [] },
  };
}

export function calculateCriteria(data: FpasFormData): { c1: number; c2: number; c3: number; c4: number; c5: number; c6: number } {
  const c1 = data.criteria1;
  const c1Points =
    c1.studentEvaluation + c1.classroomPerformance + c1.gradeSubmission +
    c1.gradeAccuracy + c1.classRecordSubmission + c1.gradingSheetSubmission +
    c1.syllabiSubmission + (c1.syllabiFormat ? 0.5 : 0) +
    (c1.syllabiObjectives ? 1 : 0) + (c1.syllabiReferences ? 0.5 : 0) +
    c1.testPaperSubmission + c1.testItemQuality + c1.testAdministration;

  const c2Points =
    data.criteria2.absences + data.criteria2.tardiness +
    data.criteria2.schoolActivities + data.criteria2.facultyMeetings +
    data.criteria2.libraryVisits;

  const sumRows = (rows: DynamicRow[]) =>
    rows.reduce((acc, r) => acc + (Number(r.points) || 0), 0);
  const capped = (rows: DynamicRow[], cap?: number) =>
    cap === undefined ? sumRows(rows) : Math.min(sumRows(rows), cap);

  const c3Points = Math.min(
    capped(data.criteria3.graduateDegree, 9) +
    capped(data.criteria3.facultyDevelopment, 4) +
    capped(data.criteria3.seminars, 3) +
    sumRows(data.criteria3.specialStudies) +
    capped(data.criteria3.awards, 4) +
    capped(data.criteria3.professionalOrgs, 3),
    20
  );

  const c4Points = Math.min(
    capped(data.criteria4.discoveries, 7) +
    sumRows(data.criteria4.publications) +
    capped(data.criteria4.researchStudies, 5) +
    capped(data.criteria4.researchArticles, 4),
    16
  );

  const c5Points = Math.min(
    capped(data.criteria5.adviser, 3) +
    capped(data.criteria5.coach, 3) +
    capped(data.criteria5.officialFunctions, 3),
    9
  );

  const c6Points = Math.min(
    capped(data.criteria6.projectsInitiated, 4) +
    capped(data.criteria6.projectsParticipated, 3) +
    capped(data.criteria6.memberships, 3),
    10
  );

  return {
    c1: Math.min(c1Points, 25),
    c2: Math.min(c2Points, 20),
    c3: c3Points,
    c4: c4Points,
    c5: c5Points,
    c6: c6Points,
  };
}

export function calculateTotal(data: FpasFormData): number {
  const t = calculateCriteria(data);
  return Math.min(t.c1 + t.c2 + t.c3 + t.c4 + t.c5 + t.c6, 100);
}

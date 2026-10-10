// ═══════════════════════════════════════════════════════════════
// FPAS PDF Document — server-rendered twin of FpasPrintDocument
// (@/components/fpas/fpas-print). Same sections, tables, check
// scales, caps, and totals; brown bands via fill colors. Rendered
// with @react-pdf/renderer (no browser needed) and served by
// GET /api/fpas/[id]/pdf and /api/fpas/export-pdf.
// ═══════════════════════════════════════════════════════════════

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  calculateCriteria,
  calculateTotal,
  type DynamicRow,
  type FpasFormData,
} from "@/lib/fpas-form";

// Helvetica (built-in) — Segoe registration proved flaky server-side
// (unregistered-family crash); body copy differs negligibly.
const BODY = "Helvetica";
const BROWN = "#6B4A30";
const CREAM = "#FEF9C3";
const SAND = "#FAF7F2";
const RULE = "#E8D5B0";

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: BODY, fontSize: 9, color: "#000" },
  band: { backgroundColor: BROWN, color: CREAM, borderRadius: 3, padding: 8, marginBottom: 10 },
  bandTitle: { fontSize: 12, fontWeight: "bold", textAlign: "center" },
  bandSub: { fontSize: 9, textAlign: "center" },
  bandForm: { fontSize: 13, fontWeight: "bold", textAlign: "center", marginTop: 4 },
  field: { fontSize: 9, marginBottom: 3 },
  bold: { fontWeight: "bold" },
  instruction: { fontSize: 9, marginBottom: 2 },
  italic: { fontSize: 8, fontStyle: "italic", marginBottom: 8 },
  h2: {
    fontSize: 11, fontWeight: "bold", color: BROWN,
    borderBottomWidth: 1, borderBottomColor: RULE,
    paddingBottom: 2, marginTop: 10, marginBottom: 5,
  },
  checkLabel: { fontSize: 9, fontWeight: "bold", color: BROWN, marginTop: 4 },
  checkOpt: { fontSize: 9, marginLeft: 10 },
  tblTitle: { fontSize: 9, fontWeight: "bold", color: BROWN, marginTop: 6, marginBottom: 2 },
  table: { borderWidth: 1, borderColor: "#000", marginBottom: 2 },
  headRow: { flexDirection: "row", backgroundColor: SAND },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 1, borderBottomWidth: 0, borderColor: "#000", padding: 3, fontSize: 8.5 },
  headCell: { borderRightWidth: 1, borderColor: "#000", padding: 3, fontSize: 8.5, fontWeight: "bold" },
  subtotal: { fontSize: 9, textAlign: "right", backgroundColor: SAND, padding: 2 },
  noRight: { borderRightWidth: 0 },
  grand: {
    backgroundColor: BROWN, color: CREAM, borderRadius: 3,
    padding: 6, fontSize: 12, fontWeight: "bold", marginTop: 10, marginBottom: 6,
  },
  sig: { fontSize: 9, marginTop: 14 },
});

interface ScaleOption { value: number; label: string }
interface CheckItem { label: string; options: ScaleOption[]; selected: number }

const C1_STUDENT_SCALE: ScaleOption[] = [
  { value: 6, label: "5.00" },
  { value: 5, label: "4.50-4.995" },
  { value: 4, label: "3.50-4.494" },
  { value: 3, label: "2.50-3.493" },
  { value: 2, label: "1.50-2.492" },
  { value: 1, label: "Below 1.491" },
];

function c1Items(c: FpasFormData["criteria1"]): CheckItem[] {
  return [
    { label: "Faculty Evaluation by Students", options: C1_STUDENT_SCALE, selected: c.studentEvaluation },
    { label: "Classroom Performance Evaluation by Superior", options: C1_STUDENT_SCALE, selected: c.classroomPerformance },
    {
      label: "Accomplishment and Submission of Grades",
      options: [
        { value: 2, label: "Before the deadline" },
        { value: 1.5, label: "As per deadline" },
        { value: 0.5, label: "After deadline (w/in the week)" },
      ],
      selected: c.gradeSubmission,
    },
    {
      label: "Accuracy on Grade Entry",
      options: [{ value: 1, label: "No corrections or alterations made" }],
      selected: c.gradeAccuracy,
    },
    {
      label: "Submission of Class Records",
      options: [
        { value: 1, label: "Before the deadline" },
        { value: 0.5, label: "As per deadline" },
        { value: 0.25, label: "After deadline (w/in the week)" },
      ],
      selected: c.classRecordSubmission,
    },
    {
      label: "Submission of Grading Sheets",
      options: [
        { value: 1, label: "Before the deadline" },
        { value: 0.5, label: "As per deadline" },
        { value: 0.25, label: "After deadline (w/in the week)" },
      ],
      selected: c.gradingSheetSubmission,
    },
    {
      label: "Accomplishment and Submission of Syllabi",
      options: [
        { value: 2, label: "Before the deadline" },
        { value: 1, label: "As per deadline" },
        { value: 0.5, label: "After deadline (w/in the week)" },
      ],
      selected: c.syllabiSubmission,
    },
    {
      label: "Accomplishment and Submission of Test Papers",
      options: [
        { value: 1, label: "10 school days before the scheduled exam" },
        { value: 0.5, label: "7 school days before the scheduled exam" },
      ],
      selected: c.testPaperSubmission,
    },
    {
      label: "Quality of the Test Items",
      options: [
        { value: 2, label: "Compliance with guidelines" },
        { value: 1, label: "With deviation" },
      ],
      selected: c.testItemQuality,
    },
    {
      label: "Administration of the Test",
      options: [{ value: 1, label: "As per schedule" }],
      selected: c.testAdministration,
    },
  ];
}

function c2Items(c: FpasFormData["criteria2"]): CheckItem[] {
  return [
    {
      label: "Record of Absences",
      options: [
        { value: 6, label: "0 days" },
        { value: 5, label: "1-2 days" },
        { value: 4, label: "3-5 days" },
      ],
      selected: c.absences,
    },
    {
      label: "Record of Tardiness",
      options: [
        { value: 5, label: "0 mins" },
        { value: 4, label: "1-60 mins" },
        { value: 3, label: "61-120 mins" },
      ],
      selected: c.tardiness,
    },
    {
      label: "Attendance in School/College Activities",
      options: [
        { value: 3, label: "0 absences" },
        { value: 2, label: "1 absence" },
        { value: 1, label: "2 absences" },
      ],
      selected: c.schoolActivities,
    },
    {
      label: "Attendance in Faculty Meetings",
      options: [
        { value: 3, label: "0 absences" },
        { value: 2, label: "1 absence" },
        { value: 1, label: "2 absences" },
      ],
      selected: c.facultyMeetings,
    },
    {
      label: "Library Visitation / Utilization of Lib Resources",
      options: [
        { value: 3, label: "37 visits and above" },
        { value: 2, label: "26-36 visits" },
        { value: 1, label: "18-25 visits" },
      ],
      selected: c.libraryVisits,
    },
  ];
}

function rowCells(r: DynamicRow, keys: string[]): string[] {
  return keys.map((k) => {
    const v = r[k];
    if (v === null || v === undefined || v === false) return "";
    // NOTE: WinAnsi (Helvetica) has no ✓ glyph — use X in PDFs.
    if (v === true) return "X";
    return String(v);
  });
}

function CheckBlock({ item }: { item: CheckItem }) {
  return (
    <View wrap={false}>
      <Text style={s.checkLabel}>{item.label} Points</Text>
      {item.options.map((o) => (
        <Text key={o.value} style={s.checkOpt}>
          ({item.selected === o.value ? "X" : " "}) {o.label} {o.value}
        </Text>
      ))}
    </View>
  );
}

function PrintTable({
  title,
  headers,
  rows,
  max,
  widths,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  max?: number;
  widths?: number[];
}) {
  const total = rows.reduce((a, r) => a + (Number(r[r.length - 1]) || 0), 0);
  const w = widths ?? headers.map(() => 1);
  return (
    <View>
      <Text style={s.tblTitle}>
        {title}
        {max !== undefined ? ` (maximum of ${max} pts)` : ""}
      </Text>
      <View style={s.table}>
        <View style={s.headRow}>
          {headers.map((h, i) => (
            <Text key={h} style={[s.headCell, i === headers.length - 1 ? s.noRight : undefined, { flex: w[i] ?? 1 }]}>
              {h}
            </Text>
          ))}
        </View>
        {(rows.length === 0 ? [headers.map(() => "")] : rows).map((r, i) => (
          <View key={i} style={s.row} wrap={false}>
            {r.map((c, j) => (
              <Text key={j} style={[s.cell, j === r.length - 1 ? s.noRight : undefined, { flex: w[j] ?? 1 }]}>
                {c || " "}
              </Text>
            ))}
          </View>
        ))}
      </View>
      <Text style={s.subtotal}>
        Subtotal: {max !== undefined ? Math.min(total, max).toFixed(1) : total.toFixed(1)}
        {max !== undefined ? ` / ${max}` : ""}
      </Text>
    </View>
  );
}

export function FpasPdfPage({
  formData,
  schoolYear,
}: {
  formData: FpasFormData;
  schoolYear: string;
}) {
  const t = calculateCriteria(formData);
  const grand = calculateTotal(formData);
  const h = formData.header;

  return (
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.bandTitle}>Republic Central Colleges</Text>
          <Text style={s.bandSub}>Angeles City</Text>
          <Text style={s.bandForm}>FACULTY PERFORMANCE APPRAISAL FORM</Text>
        </View>

        <Text style={s.field}><Text style={s.bold}>Name: </Text>{h.name || ""}</Text>
        <Text style={s.field}>
          <Text style={s.bold}>Department: </Text>{h.department || ""}{"    "}
          <Text style={s.bold}>Date Entered RCC: </Text>{h.dateEnteredRcc || ""}
        </Text>
        <Text style={s.field}><Text style={s.bold}>Bachelor&apos;s Degree / Name of Institution: </Text>{h.degreeInstitution || ""}</Text>
        <Text style={s.field}><Text style={s.bold}>School Year: </Text>{schoolYear || h.schoolYear || ""}</Text>

        <Text style={s.instruction}>
          <Text style={s.bold}>Instruction: </Text>
          For Criteria I–II, kindly check only those items that are true to you. For Criteria
          III–VI, kindly fill out and refer to the FPAS scoring guide for the corresponding points.
        </Text>
        <Text style={s.italic}>
          *The Dean/Principal and the faculty shall sit down to discuss the points marked for each
          criterion and the final ratings.
        </Text>

        <Text style={s.h2}>INSTRUCTION ({t.c1.toFixed(1)} / 25 points)</Text>
        {c1Items(formData.criteria1).map((item) => (
          <CheckBlock key={item.label} item={item} />
        ))}
        <View>
          <Text style={s.checkOpt}>(<Text style={s.bold}>{formData.criteria1.syllabiFormat ? "X" : " "}</Text>) Compliance w/ Format 0.5</Text>
          <Text style={s.checkOpt}>(<Text style={s.bold}>{formData.criteria1.syllabiObjectives ? "X" : " "}</Text>) Complete Course Objectives/Content 1</Text>
          <Text style={s.checkOpt}>(<Text style={s.bold}>{formData.criteria1.syllabiReferences ? "X" : " "}</Text>) At least 5 references w/in the last 5 yrs 0.5</Text>
        </View>

        <Text style={s.h2}>FACULTY ATTENDANCE ({t.c2.toFixed(1)} / 20 points)</Text>
        {c2Items(formData.criteria2).map((item) => (
          <CheckBlock key={item.label} item={item} />
        ))}

        <Text style={s.h2}>PROFESSIONAL GROWTH ({t.c3.toFixed(1)} / 20 points)</Text>
        <PrintTable title="Graduate Degree" headers={["Title", "Name of Institution", "Date Graduated or Units Earned", "Points"]} rows={formData.criteria3.graduateDegree.map((r) => rowCells(r, ["title", "institution", "nature", "points"]))} max={9} widths={[3, 3, 3, 1]} />
        <PrintTable title="Participation in Faculty Development Activities (within the last 3 years)" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria3.facultyDevelopment.map((r) => rowCells(r, ["title", "nature", "points"]))} max={4} widths={[5, 4, 1]} />
        <PrintTable title="Attendance and Participation in Seminars, Symposia and Workshop within last 3 years" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria3.seminars.map((r) => rowCells(r, ["title", "nature", "points"]))} max={3} widths={[5, 4, 1]} />
        <PrintTable title="Special Studies / Training within last 3 years" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria3.specialStudies.map((r) => rowCells(r, ["title", "nature", "points"]))} widths={[5, 4, 1]} />
        <PrintTable title="Awards / Recognition" headers={["Nature of Award", "Awarded by", "Date Awarded", "Points"]} rows={formData.criteria3.awards.map((r) => rowCells(r, ["title", "institution", "nature", "points"]))} max={4} widths={[3, 3, 2, 1]} />
        <PrintTable title="Membership and Participation in Professional Organizations" headers={["Name of Organization", "Position", "No. of Years", "Points"]} rows={formData.criteria3.professionalOrgs.map((r) => rowCells(r, ["title", "nature", "institution", "points"]))} max={3} widths={[4, 3, 2, 1]} />

        <Text style={s.h2}>RESEARCHES AND PUBLICATIONS ({t.c4.toFixed(1)} / 16 points)</Text>
        <Text style={s.instruction}>Within the last three (3) years</Text>
        <PrintTable title="Scientific Discoveries and Inventions performed with official certification" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria4.discoveries.map((r) => rowCells(r, ["title", "nature", "points"]))} max={7} widths={[5, 4, 1]} />
        <PrintTable title="Books / Manuals / Instructional Materials / Modules Published" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria4.publications.map((r) => rowCells(r, ["title", "nature", "points"]))} widths={[5, 4, 1]} />
        <PrintTable title="Research Studies Conducted and Presented" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria4.researchStudies.map((r) => rowCells(r, ["title", "nature", "points"]))} max={5} widths={[5, 4, 1]} />
        <PrintTable title="Research Articles Published" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria4.researchArticles.map((r) => rowCells(r, ["title", "nature", "points"]))} max={4} widths={[5, 4, 1]} />

        <Text style={s.h2}>INVOLVEMENT IN SCHOOL FUNCTIONS / STUDENT EXTRA-CURRICULAR ACTIVITIES ({t.c5.toFixed(1)} / 9 points)</Text>
        <Text style={s.instruction}>Within the last three (3) years</Text>
        <PrintTable title="As Adviser of Student Organizations" headers={["Name of Organization", "Period", "Points"]} rows={formData.criteria5.adviser.map((r) => rowCells(r, ["title", "nature", "points"]))} max={3} widths={[5, 3, 1]} />
        <PrintTable title="As Official Coach of Student Competitions" headers={["Title of the Competition", "Period", "Points"]} rows={formData.criteria5.coach.map((r) => rowCells(r, ["title", "nature", "points"]))} max={3} widths={[5, 3, 1]} />
        <PrintTable title="Official School Functions (Working Committee)" headers={["Name of the School Functions", "Nature of Participation", "Points"]} rows={formData.criteria5.officialFunctions.map((r) => rowCells(r, ["title", "nature", "points"]))} max={3} widths={[5, 4, 1]} />

        <Text style={s.h2}>COMMUNITY INVOLVEMENT ({t.c6.toFixed(1)} / 10 points)</Text>
        <Text style={s.instruction}>Within the last three (3) years</Text>
        <PrintTable title="Projects Initiated" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria6.projectsInitiated.map((r) => rowCells(r, ["title", "nature", "points"]))} max={4} widths={[5, 4, 1]} />
        <PrintTable title="Projects Participated" headers={["Title", "Nature of Participation", "Points"]} rows={formData.criteria6.projectsParticipated.map((r) => rowCells(r, ["title", "nature", "points"]))} max={3} widths={[5, 4, 1]} />
        <PrintTable title="Membership in Socio-Civic & Religious Organizations" headers={["Name of Organization", "Position", "No. of Years", "Points"]} rows={formData.criteria6.memberships.map((r) => rowCells(r, ["title", "nature", "institution", "points"]))} max={3} widths={[4, 3, 2, 1]} />

        <Text style={s.grand}>GRAND TOTAL: {grand.toFixed(1)} / 100</Text>
        <Text style={s.sig}>Evaluated by: ________________________________________</Text>
        <Text style={s.sig}>____________________________    Dean/Principal    Date: ______________</Text>
      </Page>
  );
}

export function FpasPdfDocument({
  formData,
  schoolYear,
}: {
  formData: FpasFormData;
  schoolYear: string;
}) {
  return (
    <Document>
      <FpasPdfPage formData={formData} schoolYear={schoolYear} />
    </Document>
  );
}

export function FpasPdfBundle({
  docs,
}: {
  docs: { formData: FpasFormData; schoolYear: string }[];
}) {
  return (
    <Document>
      {docs.map((d, i) => (
        <FpasPdfPage key={i} formData={d.formData} schoolYear={d.schoolYear} />
      ))}
    </Document>
  );
}

"use client";

// ═══════════════════════════════════════════════════════════════
// FPAS Print Document — faithful to the official Word form
// (v2RCC-FPAS-Faculty-Performance-Appraisal-Form.docx).
// Layout mirror: centered org header, title, fill-in fields,
// instruction block, Criteria I–II checkmark scales, Criteria
// III–VI grid tables with the template's column headers,
// per-criterion subtotals (same caps as the scoring engine),
// grand total, and the signature block. The template carries no
// color, so this is black grid + bold headings by design.
// Rendered inside `.print-only` containers; screen shows nothing.
// ═══════════════════════════════════════════════════════════════

import {
  calculateCriteria,
  calculateTotal,
  type DynamicRow,
  type FpasFormData,
} from "@/components/fpas/fpas-pages";

// ─── Check-scale definitions (mirror the fill form options) ───

interface ScaleOption {
  value: number;
  label: string;
}

interface CheckItem {
  label: string;
  options: ScaleOption[];
  selected: number;
}

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

// ─── Small render helpers (plain black grid, template style) ───

const cellClass = "border border-black px-2 py-1 text-[11px] text-black align-top";
const headCellClass = "border border-black px-2 py-1 text-[11px] font-bold text-black align-top bg-[#FAF7F2]";
const bandClass = "bg-[#6B4A30] text-[#FEF9C3]";
const subtotalClass = "bg-[#FAF7F2]";

function CheckBlock({ item }: { item: CheckItem }) {
  return (
    <div className="mb-1.5">
      <p className="text-[11px] font-semibold text-[#6B4A30]">{item.label} <span className="font-normal">Points</span></p>
      {item.options.map((o) => (
        <p key={o.value} className="text-[11px] text-black ml-3">
          ({item.selected === o.value ? "✓" : " "}) {o.label}{" "}
          <span className="font-semibold">{o.value}</span>
        </p>
      ))}
    </div>
  );
}

function PrintTable({
  title,
  headers,
  rows,
  max,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  max?: number;
}) {
  const total = rows.reduce((a, r) => a + (Number(r[r.length - 1]) || 0), 0);
  return (
    <div className="mb-2 print-keep">
      <p className="text-[11px] font-semibold text-[#6B4A30] mb-0.5">
        {title}
        {max !== undefined ? ` (maximum of ${max} pts)` : ""}
      </p>
      <table className="w-full border-collapse border border-black">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className={headCellClass}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              {headers.map((h) => (
                <td key={h} className={cellClass}>&nbsp;</td>
              ))}
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={cellClass}>{c || <>&nbsp;</>}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <p className={`text-[11px] text-black text-right mt-0.5 px-1 ${subtotalClass}`}>
        Subtotal: <span className="font-bold text-[#6B4A30]">{max !== undefined ? Math.min(total, max).toFixed(1) : total.toFixed(1)}</span>
        {max !== undefined ? ` / ${max}` : ""}
      </p>
    </div>
  );
}

function rowCells(r: DynamicRow, keys: string[]): string[] {
  return keys.map((k) => {
    const v = r[k];
    if (v === null || v === undefined || v === false) return "";
    if (v === true) return "✓";
    return String(v);
  });
}

// ─── The document ───

export function FpasPrintDocument({
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
    <div className="text-black bg-white">
      {/* Org header (template paras 1–4) — brown band */}
      <div className={`${bandClass} rounded-sm px-3 py-2 mb-3 print:rounded-none`}>
        <p className="text-center text-[13px] font-bold">Republic Central Colleges</p>
        <p className="text-center text-[11px]">Angeles City</p>
        <p className="text-center text-[14px] font-bold mt-1">FACULTY PERFORMANCE APPRAISAL FORM</p>
      </div>

      {/* Fill-in fields (template paras 6–12) */}
      <div className="text-[11px] space-y-1 mb-2">
        <p><span className="font-semibold">Name:</span> {h.name || ""}</p>
        <p>
          <span className="font-semibold">Department:</span> {h.department || ""}{" "}
          <span className="font-semibold ml-4">Date Entered RCC:</span> {h.dateEnteredRcc || ""}
        </p>
        <p><span className="font-semibold">Bachelor&rsquo;s Degree / Name of Institution:</span> {h.degreeInstitution || ""}</p>
        <p><span className="font-semibold">School Year:</span> {schoolYear || h.schoolYear || ""}</p>
      </div>

      {/* Instruction block (template paras 14–16) */}
      <p className="text-[11px] mb-1">
        <span className="font-semibold">Instruction:</span> For Criteria I–II, kindly check only those
        items that are true to you. For Criteria III–VI, kindly fill out and refer to the FPAS
        scoring guide for the corresponding points.
      </p>
      <p className="text-[11px] italic mb-3">
        *The Dean/Principal and the faculty shall sit down to discuss the points marked for each
        criterion and the final ratings.
      </p>

      {/* I. Instruction (25) */}
      <p className="text-[12px] font-bold mt-3 mb-1 text-[#6B4A30] border-b border-[#E8D5B0] pb-0.5">INSTRUCTION ({t.c1.toFixed(1)} / 25 points)</p>
      {c1Items(formData.criteria1).map((item) => (
        <CheckBlock key={item.label} item={item} />
      ))}
      <div className="text-[11px] ml-3 mb-2">
        <p>(<span className="font-bold">{formData.criteria1.syllabiFormat ? "✓" : " "}</span>) Compliance w/ Format <span className="font-semibold">0.5</span></p>
        <p>(<span className="font-bold">{formData.criteria1.syllabiObjectives ? "✓" : " "}</span>) Complete Course Objectives/Content <span className="font-semibold">1</span></p>
        <p>(<span className="font-bold">{formData.criteria1.syllabiReferences ? "✓" : " "}</span>) At least 5 references w/in the last 5 yrs <span className="font-semibold">0.5</span></p>
      </div>

      {/* II. Faculty Attendance (20) */}
      <p className="text-[12px] font-bold mt-3 mb-1 text-[#6B4A30] border-b border-[#E8D5B0] pb-0.5">FACULTY ATTENDANCE ({t.c2.toFixed(1)} / 20 points)</p>
      {c2Items(formData.criteria2).map((item) => (
        <CheckBlock key={item.label} item={item} />
      ))}

      {/* III. Professional Growth (20) */}
      <p className="text-[12px] font-bold mt-3 mb-1 text-[#6B4A30] border-b border-[#E8D5B0] pb-0.5">PROFESSIONAL GROWTH ({t.c3.toFixed(1)} / 20 points)</p>
      <PrintTable
        title="Graduate Degree"
        headers={["Title", "Name of Institution", "Date Graduated or Units Earned", "Points"]}
        rows={formData.criteria3.graduateDegree.map((r) => rowCells(r, ["title", "institution", "nature", "points"]))}
        max={9}
      />
      <PrintTable
        title="Participation in Faculty Development Activities (within the last 3 years)"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria3.facultyDevelopment.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={4}
      />
      <PrintTable
        title="Attendance and Participation in Seminars, Symposia and Workshop within last 3 years"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria3.seminars.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={3}
      />
      <PrintTable
        title="Special Studies / Training within last 3 years"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria3.specialStudies.map((r) => rowCells(r, ["title", "nature", "points"]))}
      />
      <PrintTable
        title="Awards / Recognition"
        headers={["Nature of Award", "Awarded by", "Date Awarded", "Points"]}
        rows={formData.criteria3.awards.map((r) => rowCells(r, ["title", "institution", "nature", "points"]))}
        max={4}
      />
      <PrintTable
        title="Membership and Participation in Professional Organizations"
        headers={["Name of Organization", "Position", "No. of Years", "Points"]}
        rows={formData.criteria3.professionalOrgs.map((r) => rowCells(r, ["title", "nature", "institution", "points"]))}
        max={3}
      />

      {/* IV. Researches and Publications (16) */}
      <p className="text-[12px] font-bold mt-3 mb-1 text-[#6B4A30] border-b border-[#E8D5B0] pb-0.5">RESEARCHES AND PUBLICATIONS ({t.c4.toFixed(1)} / 16 points)</p>
      <p className="text-[11px] mb-1">Within the last three (3) years</p>
      <PrintTable
        title="Scientific Discoveries and Inventions performed with official certification"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria4.discoveries.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={7}
      />
      <PrintTable
        title="Books / Manuals / Instructional Materials / Modules Published"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria4.publications.map((r) => rowCells(r, ["title", "nature", "points"]))}
      />
      <PrintTable
        title="Research Studies Conducted and Presented"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria4.researchStudies.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={5}
      />
      <PrintTable
        title="Research Articles Published"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria4.researchArticles.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={4}
      />

      {/* V. Involvement (9) */}
      <p className="text-[12px] font-bold mt-3 mb-1 text-[#6B4A30] border-b border-[#E8D5B0] pb-0.5">
        INVOLVEMENT IN SCHOOL FUNCTIONS / STUDENT EXTRA-CURRICULAR ACTIVITIES ({t.c5.toFixed(1)} / 9 points)
      </p>
      <p className="text-[11px] mb-1">Within the last three (3) years</p>
      <PrintTable
        title="As Adviser of Student Organizations"
        headers={["Name of Organization", "Period", "Points"]}
        rows={formData.criteria5.adviser.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={3}
      />
      <PrintTable
        title="As Official Coach of Student Competitions"
        headers={["Title of the Competition", "Period", "Points"]}
        rows={formData.criteria5.coach.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={3}
      />
      <PrintTable
        title="Official School Functions (Working Committee)"
        headers={["Name of the School Functions", "Nature of Participation", "Points"]}
        rows={formData.criteria5.officialFunctions.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={3}
      />

      {/* VI. Community (10) */}
      <p className="text-[12px] font-bold mt-3 mb-1 text-[#6B4A30] border-b border-[#E8D5B0] pb-0.5">COMMUNITY INVOLVEMENT ({t.c6.toFixed(1)} / 10 points)</p>
      <p className="text-[11px] mb-1">Within the last three (3) years</p>
      <PrintTable
        title="Projects Initiated"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria6.projectsInitiated.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={4}
      />
      <PrintTable
        title="Projects Participated"
        headers={["Title", "Nature of Participation", "Points"]}
        rows={formData.criteria6.projectsParticipated.map((r) => rowCells(r, ["title", "nature", "points"]))}
        max={3}
      />
      <PrintTable
        title="Membership in Socio-Civic & Religious Organizations"
        headers={["Name of Organization", "Position", "No. of Years", "Points"]}
        rows={formData.criteria6.memberships.map((r) => rowCells(r, ["title", "nature", "institution", "points"]))}
        max={3}
      />

      {/* Grand total + signature (template Table 15) */}
      <p className={`${bandClass} rounded-sm px-3 py-1.5 text-[13px] font-bold mt-3 mb-2 print:rounded-none`}>GRAND TOTAL: {grand.toFixed(1)} / 100</p>
      <div className="text-[11px] mt-4 space-y-4">
        <p>Evaluated by: ________________________________________</p>
        <p>
          ____________________________&nbsp;&nbsp;&nbsp;&nbsp;
          Dean/Principal&nbsp;&nbsp;&nbsp;&nbsp;Date: ______________
        </p>
      </div>
    </div>
  );
}

"use client";

// ═══════════════════════════════════════════════════════════════
// Personnel Profile Print Document — layout-faithful to the
// official non-teaching profile template
// (NON-TEACHING-PERSONNEL-PROFILE-Template-for-SY-2026-2027).
// Structure mirror: HR header, 2x2 photo box, sections I–IX grid
// tables with the template's column headers, signature block,
// attachments footer. Blank cells where the record has no data
// (the template is fill-in blanks by design). Template carries
// no color: black grid + bold headings. Title is the neutral
// "PERSONNEL PROFILE" so it fits teaching and non-teaching alike.
// Rendered inside `.print-only` containers only.
// ═══════════════════════════════════════════════════════════════

const cellClass = "border border-black px-2 py-1 text-[11px] text-black align-top";
const headCellClass = "border border-black px-2 py-1 text-[11px] font-bold text-black align-top bg-white";
const labelCellClass = "border border-black px-2 py-1 text-[11px] font-semibold text-black align-top";

export interface PrintableEmployee {
  employeeId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  email: string;
  phone: string | null;
  address: string | null;
  birthday: string | null;
  gender: string | null;
  employmentType: string;
  contractType: string;
  hireDate: string | null;
  active: boolean;
  groupName: string | null;
  roleName: string | null;
  placeOfBirth?: string | null;
  rank?: string | null;
  civilStatus?: string | null;
  citizenship?: string | null;
  religion?: string | null;
  photo?: string | null;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString();
}

function SectionTable({
  title,
  headers,
  rows,
  minBlankRows = 3,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  minBlankRows?: number;
}) {
  const blanks = Math.max(0, minBlankRows - rows.length);
  return (
    <div className="mb-3 print-keep">
      <p className="text-[12px] font-bold text-black mb-1">{title}</p>
      <table className="w-full border-collapse border border-black">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className={headCellClass}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={cellClass}>{c || <>&nbsp;</>}</td>
              ))}
            </tr>
          ))}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`b${i}`}>
              {headers.map((h) => (
                <td key={h} className={cellClass}>&nbsp;</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProfilePrintDocument({
  employee,
  profileData,
  photoUrl,
  schoolYear,
}: {
  employee: PrintableEmployee;
  profileData: Record<string, Array<Record<string, unknown>>>;
  photoUrl: string | null;
  schoolYear: string;
}) {
  const fullName = `${employee.firstName} ${employee.middleName ? employee.middleName + " " : ""}${employee.lastName}`;
  const rows = (key: string): Array<Record<string, string>> =>
    (profileData[key] ?? []) as Array<Record<string, string>>;
  const cell = (r: Record<string, string>, k: string) => r[k] ?? "";

  return (
    <div className="text-black bg-white">
      {/* Header (template header lines) */}
      <p className="text-center text-[13px] font-bold">Republic Central Colleges</p>
      <p className="text-center text-[11px]">HUMAN RESOURCE DEPARTMENT</p>

      {/* 2x2 photo box, floated right like the template text box */}
      <div className="flex justify-end mb-1">
        <div className="w-[130px] border border-black text-center">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={fullName} className="w-full h-[130px] object-cover" />
          ) : (
            <div className="h-[130px] flex items-center justify-center px-1">
              <span className="text-[10px]">Full Face 2x2 Formal ID Picture</span>
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[14px] font-bold">PERSONNEL PROFILE</p>
      <p className="text-center text-[11px] mb-3">Academic Year {schoolYear}</p>

      {/* I. Personal Profile (template Table 0) */}
      <p className="text-[12px] font-bold text-black mb-1">I. PERSONAL PROFILE</p>
      <table className="w-full border-collapse border border-black mb-3">
        <tbody>
          <tr>
            <td className={labelCellClass}>Full Name</td>
            <td className={cellClass}>:</td>
            <td className={cellClass} colSpan={4}>{fullName}</td>
          </tr>
          <tr>
            <td className={labelCellClass}>Present Address</td>
            <td className={cellClass}>:</td>
            <td className={cellClass} colSpan={4}>{employee.address ?? ""}</td>
          </tr>
          <tr>
            <td className={labelCellClass}>Date of Birth</td>
            <td className={cellClass}>:</td>
            <td className={cellClass}>{fmtDate(employee.birthday)}</td>
            <td className={labelCellClass}>Place of Birth</td>
            <td className={cellClass}>:</td>
            <td className={cellClass}>{employee.placeOfBirth ?? ""}</td>
          </tr>
          <tr>
            <td className={labelCellClass}>Date Hired in RCC</td>
            <td className={cellClass}>:</td>
            <td className={cellClass}>{fmtDate(employee.hireDate)}</td>
            <td className={labelCellClass}>Contact Number</td>
            <td className={cellClass}>:</td>
            <td className={cellClass}>{employee.phone ?? ""}</td>
          </tr>
          <tr>
            <td className={labelCellClass}>Working Status</td>
            <td className={cellClass}>:</td>
            <td className={cellClass}>{employee.active ? "Active" : "Inactive"} · {employee.employmentType} · {employee.contractType}</td>
            <td className={labelCellClass}>Rank</td>
            <td className={cellClass}>:</td>
            <td className={cellClass}>{employee.rank ?? ""}</td>
          </tr>
          <tr>
            <td className={labelCellClass}>Employee ID</td>
            <td className={cellClass}>:</td>
            <td className={cellClass}>{employee.employeeId}</td>
            <td className={labelCellClass}>Department / Role</td>
            <td className={cellClass}>:</td>
            <td className={cellClass}>{[employee.groupName, employee.roleName].filter(Boolean).join(" · ")}</td>
          </tr>
        </tbody>
      </table>

      <SectionTable
        title="II. EDUCATIONAL BACKGROUND"
        headers={["Degree", "Date Earned", "School"]}
        rows={rows("education").map((r) => [cell(r, "degree"), cell(r, "dateEarned"), cell(r, "school")])}
      />
      <SectionTable
        title="III. PROFESSIONAL PRACTICE / EXPERIENCE"
        headers={["Position", "Year", "School / Organization"]}
        rows={rows("experience").map((r) => [cell(r, "position"), cell(r, "year"), cell(r, "organization")])}
      />
      <SectionTable
        title="IV. ELIGIBILITY"
        headers={["Name of Examination", "Place", "Date", "Ratings"]}
        rows={rows("eligibility").map((r) => [cell(r, "exam"), cell(r, "place"), cell(r, "date"), cell(r, "rating")])}
      />
      <SectionTable
        title="V. ACHIEVEMENT / AWARDS"
        headers={["Award", "Year", "Granting Institution"]}
        rows={rows("awards").map((r) => [cell(r, "award"), cell(r, "year"), cell(r, "institution")])}
      />
      <SectionTable
        title="VI. PRODUCTIVE SCHOLARSHIP"
        headers={["Title", "Publication", "Issue"]}
        rows={rows("publications").map((r) => [cell(r, "title"), cell(r, "publication"), cell(r, "issue")])}
      />
      <SectionTable
        title="VII. ORGANIZATIONAL AFFILIATIONS"
        headers={["Organization", "Position", "Inclusive Date"]}
        rows={rows("affiliations").map((r) => [cell(r, "organization"), cell(r, "position"), cell(r, "date")])}
      />
      <SectionTable
        title="VIII. SEMINARS / CONFERENCES / WORKSHOPS ATTENDED (Past 5 years)"
        headers={["Title", "Scope", "Inclusive Date / Venue", "Nature of Participation"]}
        rows={rows("seminars").map((r) => [cell(r, "title"), cell(r, "scope"), cell(r, "date"), cell(r, "nature")])}
        minBlankRows={4}
      />
      <SectionTable
        title="OTHER ACCOMPLISHMENTS / RECOGNITION"
        headers={["Name of the School Functions", "Nature of Participation"]}
        rows={rows("accomplishments").map((r) => [cell(r, "function"), cell(r, "nature")])}
      />
      <SectionTable
        title="IX. COMMUNITY INVOLVEMENT"
        headers={["Title", "Beneficiaries", "Inclusive Date / Venue", "Nature of Participation"]}
        rows={rows("community").map((r) => [cell(r, "title"), cell(r, "beneficiaries"), cell(r, "date"), cell(r, "nature")])}
        minBlankRows={4}
      />

      {/* Signature + attachments (template footer) */}
      <div className="text-[11px] mt-6 space-y-5">
        <div>
          <p>________________________________________</p>
          <p className="font-semibold">FULL NAME AND SIGNATURE</p>
          <p>Designation, Office</p>
        </div>
        <div>
          <p>Attachment 1: Official Transcript of Records</p>
          <p>(Undergraduate and Graduate)</p>
          <p className="mt-2">Attachment 2: RCC Employment Contract</p>
        </div>
      </div>
    </div>
  );
}

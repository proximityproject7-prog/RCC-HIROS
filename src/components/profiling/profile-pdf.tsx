// ═══════════════════════════════════════════════════════════════
// Personnel Profile PDF Document — server-rendered twin of
// ProfilePrintDocument (@/components/profiling/profile-print).
// Same I–IX structure, brown bands, 2x2 photo (embedded bytes).
// ═══════════════════════════════════════════════════════════════

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ReactNode } from "react";
import type { PrintableEmployee } from "@/components/profiling/profile-print";

const BODY = "Helvetica";
const BROWN = "#6B4A30";
const CREAM = "#FEF9C3";
const SAND = "#FAF7F2";
const RULE = "#E8D5B0";

const s = StyleSheet.create({
  page: { padding: 36, fontFamily: BODY, fontSize: 9, color: "#000" },
  band: { backgroundColor: BROWN, color: CREAM, borderRadius: 3, padding: 8, marginBottom: 8 },
  bandTitle: { fontSize: 12, fontWeight: "bold", textAlign: "center" },
  bandSub: { fontSize: 9, textAlign: "center" },
  titleBand: { backgroundColor: BROWN, color: CREAM, borderRadius: 3, padding: 5, fontSize: 13, fontWeight: "bold", textAlign: "center" },
  sub: { fontSize: 9, textAlign: "center", marginTop: 3, marginBottom: 8 },
  photoWrap: { alignItems: "flex-end", marginBottom: 4 },
  photo: { width: 110, height: 110, borderWidth: 1, borderColor: "#000" },
  photoBox: { width: 110, height: 110, borderWidth: 1, borderColor: "#000", justifyContent: "center", alignItems: "center", padding: 6 },
  photoCap: { fontSize: 8, textAlign: "center" },
  h2: {
    fontSize: 11, fontWeight: "bold", color: BROWN,
    borderBottomWidth: 1, borderBottomColor: RULE,
    paddingBottom: 2, marginTop: 10, marginBottom: 4,
  },
  table: { borderWidth: 1, borderColor: "#000", marginBottom: 2 },
  headRow: { flexDirection: "row", backgroundColor: SAND },
  row: { flexDirection: "row" },
  cell: { borderRightWidth: 1, borderColor: "#000", padding: 3, fontSize: 8.5 },
  headCell: { borderRightWidth: 1, borderColor: "#000", padding: 3, fontSize: 8.5, fontWeight: "bold" },
  labelCell: { borderRightWidth: 1, borderColor: "#000", padding: 3, fontSize: 8.5, fontWeight: "bold", backgroundColor: SAND },
  sig: { fontSize: 9, marginTop: 16 },
});

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
  widths,
  minBlankRows = 3,
}: {
  title: string;
  headers: string[];
  rows: string[][];
  widths?: number[];
  minBlankRows?: number;
}) {
  const w = widths ?? headers.map(() => 1);
  const blanks = Math.max(0, minBlankRows - rows.length);
  return (
    <View>
      <Text style={s.h2}>{title}</Text>
      <View style={s.table}>
        <View style={s.headRow}>
          {headers.map((h, i) => (
            <Text key={h} style={[s.headCell, i === headers.length - 1 ? stylesNoRight : undefined, { flex: w[i] ?? 1 }]}>{h}</Text>
          ))}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={s.row} wrap={false}>
            {r.map((c, j) => (
              <Text key={j} style={[s.cell, j === r.length - 1 ? stylesNoRight : undefined, { flex: w[j] ?? 1 }]}>{c || " "}</Text>
            ))}
          </View>
        ))}
        {Array.from({ length: blanks }).map((_, i) => (
          <View key={`b${i}`} style={s.row}>
            {headers.map((h, j) => (
              <Text key={j} style={[s.cell, j === headers.length - 1 ? stylesNoRight : undefined, { flex: w[j] ?? 1 }]}> </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function FieldRow({ pairs }: { pairs: [string, string][] }) {
  // Fixed 12-unit grid shared by EVERY row (mirrors the template's
  // 6-column table): label 3 / colon 1 / value 8 for a lone pair, or
  // two pairs of label 3 / colon 1 / value 2. Colons always land on
  // the same x-positions; the table edge supplies the last border.
  const cells: ReactNode[] = [];
  if (pairs.length === 1) {
    const [label, value] = pairs[0];
    cells.push(
      <Text key="l0" style={[s.labelCell, { flex: 3 }]}>{label}</Text>,
      <Text key="c0" style={[s.cell, { flex: 1 }]}>:</Text>,
      <Text key="v0" style={[s.cell, stylesNoRight, { flex: 8 }]}>{value || " "}</Text>
    );
  } else {
    pairs.forEach(([label, value], i) => {
      const last = i === pairs.length - 1;
      cells.push(
        <Text key={`l${i}`} style={[s.labelCell, { flex: 3 }]}>{label}</Text>,
        <Text key={`c${i}`} style={[s.cell, { flex: 1 }]}>:</Text>,
        <Text key={`v${i}`} style={[s.cell, last ? stylesNoRight : undefined, { flex: 2 }]}>{value || " "}</Text>
      );
    });
  }
  return <View style={s.row}>{cells}</View>;
}

const stylesNoRight = { borderRightWidth: 0 };

export function ProfilePdfDocument({
  employee,
  profileData,
  photoDataUri,
  schoolYear,
}: {
  employee: PrintableEmployee;
  profileData: Record<string, Array<Record<string, unknown>>>;
  photoDataUri: string | null;
  schoolYear: string;
}) {
  const fullName = `${employee.firstName} ${employee.middleName ? employee.middleName + " " : ""}${employee.lastName}`;
  const rows = (key: string): Array<Record<string, string>> =>
    (profileData[key] ?? []) as Array<Record<string, string>>;
  const cell = (r: Record<string, string>, k: string) => r[k] ?? "";

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <Text style={s.bandTitle}>Republic Central Colleges</Text>
          <Text style={s.bandSub}>HUMAN RESOURCE DEPARTMENT</Text>
        </View>

        <View style={s.photoWrap}>
          {photoDataUri ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.photo} src={photoDataUri} />
          ) : (
            <View style={s.photoBox}>
              <Text style={s.photoCap}>Full Face 2x2 Formal ID Picture</Text>
            </View>
          )}
        </View>

        <Text style={s.titleBand}>PERSONNEL PROFILE</Text>
        <Text style={s.sub}>Academic Year {schoolYear}</Text>

        <Text style={s.h2}>I. PERSONAL PROFILE</Text>
        <View style={s.table}>
          <FieldRow pairs={[["Full Name", fullName]]} />
          <FieldRow pairs={[["Present Address", employee.address ?? ""]]} />
          <FieldRow pairs={[["Date of Birth", fmtDate(employee.birthday)], ["Place of Birth", employee.placeOfBirth ?? ""]]} />
          <FieldRow pairs={[["Date Hired in RCC", fmtDate(employee.hireDate)], ["Contact Number", employee.phone ?? ""]]} />
          <FieldRow pairs={[["Working Status", `${employee.active ? "Active" : "Inactive"} · ${employee.employmentType} · ${employee.contractType}`], ["Rank", employee.rank ?? ""]]} />
          <FieldRow pairs={[["Employee ID", employee.employeeId], ["Department / Role", [employee.groupName, employee.roleName].filter(Boolean).join(" · ")]]} />
        </View>

        <SectionTable title="II. EDUCATIONAL BACKGROUND" headers={["Degree", "Date Earned", "School"]} rows={rows("education").map((r) => [cell(r, "degree"), cell(r, "dateEarned"), cell(r, "school")])} widths={[4, 2, 4]} />
        <SectionTable title="III. PROFESSIONAL PRACTICE / EXPERIENCE" headers={["Position", "Year", "School / Organization"]} rows={rows("experience").map((r) => [cell(r, "position"), cell(r, "year"), cell(r, "organization")])} widths={[4, 2, 4]} />
        <SectionTable title="IV. ELIGIBILITY" headers={["Name of Examination", "Place", "Date", "Ratings"]} rows={rows("eligibility").map((r) => [cell(r, "exam"), cell(r, "place"), cell(r, "date"), cell(r, "rating")])} widths={[4, 3, 2, 2]} />
        <SectionTable title="V. ACHIEVEMENT / AWARDS" headers={["Award", "Year", "Granting Institution"]} rows={rows("awards").map((r) => [cell(r, "award"), cell(r, "year"), cell(r, "institution")])} widths={[4, 2, 4]} />
        <SectionTable title="VI. PRODUCTIVE SCHOLARSHIP" headers={["Title", "Publication", "Issue"]} rows={rows("publications").map((r) => [cell(r, "title"), cell(r, "publication"), cell(r, "issue")])} widths={[4, 3, 2]} />
        <SectionTable title="VII. ORGANIZATIONAL AFFILIATIONS" headers={["Organization", "Position", "Inclusive Date"]} rows={rows("affiliations").map((r) => [cell(r, "organization"), cell(r, "position"), cell(r, "date")])} widths={[4, 3, 3]} />
        <SectionTable title="VIII. SEMINARS / CONFERENCES / WORKSHOPS ATTENDED (Past 5 years)" headers={["Title", "Scope", "Inclusive Date / Venue", "Nature of Participation"]} rows={rows("seminars").map((r) => [cell(r, "title"), cell(r, "scope"), cell(r, "date"), cell(r, "nature")])} widths={[4, 2, 3, 3]} minBlankRows={4} />
        <SectionTable title="OTHER ACCOMPLISHMENTS / RECOGNITION" headers={["Name of the School Functions", "Nature of Participation"]} rows={rows("accomplishments").map((r) => [cell(r, "function"), cell(r, "nature")])} widths={[6, 4]} />
        <SectionTable title="IX. COMMUNITY INVOLVEMENT" headers={["Title", "Beneficiaries", "Inclusive Date / Venue", "Nature of Participation"]} rows={rows("community").map((r) => [cell(r, "title"), cell(r, "beneficiaries"), cell(r, "date"), cell(r, "nature")])} widths={[3, 3, 2, 3]} minBlankRows={4} />

        <Text style={s.sig}>________________________________________</Text>
        <Text style={[s.sig, { marginTop: 2, fontWeight: "bold" }]}>FULL NAME AND SIGNATURE</Text>
        <Text style={{ fontSize: 9 }}>Designation, Office</Text>
        <Text style={s.sig}>Attachment 1: Official Transcript of Records</Text>
        <Text style={{ fontSize: 9 }}>(Undergraduate and Graduate)</Text>
        <Text style={{ fontSize: 9, marginTop: 6 }}>Attachment 2: RCC Employment Contract</Text>
      </Page>
    </Document>
  );
}

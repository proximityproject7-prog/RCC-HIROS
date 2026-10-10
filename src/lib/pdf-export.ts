// ═══════════════════════════════════════════════════════════════
// RCC-HIROS — Server PDF helpers (shared by the download routes).
// Filenames: FPAS-<EMP-ID>-<Name>-<SY>.pdf / PROFILE-<EMP-ID>-<Name>.pdf
// ═══════════════════════════════════════════════════════════════

export function safeFilePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 60) || "file";
}

export function fpasPdfFilename(employeeCode: string, name: string, schoolYear: string): string {
  return `FPAS-${safeFilePart(employeeCode)}-${safeFilePart(name)}-${safeFilePart(schoolYear)}.pdf`;
}

export function profilePdfFilename(employeeCode: string, name: string): string {
  return `PROFILE-${safeFilePart(employeeCode)}-${safeFilePart(name)}.pdf`;
}

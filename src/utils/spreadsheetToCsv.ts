/**
 * Converts a spreadsheet (.xlsx, .xls, or .csv) File into multi-section CSV text
 * compatible with EditDesk's idempotent importer.
 */
export async function spreadsheetFileToCsvText(file: File): Promise<string> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv') || file.type === 'text/csv') {
    return file.text();
  }

  const XLSX = await import('xlsx');

  const formatExcelDate = (val: unknown): string => {
    if (typeof val === 'number' && Number.isFinite(val) && val > 25000 && val < 90000) {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed && parsed.y && parsed.m && parsed.d) {
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    }
    return String(val ?? '').trim();
  };

  const escapeCsvCell = (val: string): string => {
    if (/[",\n\r]/.test(val)) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sections: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (rawRows.length === 0) continue;

    // Identify date columns from the header row so Excel serial numbers become ISO dates
    const headerRow = rawRows[0].map((c) => String(c ?? '').trim().toLowerCase());
    const dateColIndices = new Set<number>();
    headerRow.forEach((h, idx) => {
      if (h.includes('date') || h.includes('deadline')) {
        dateColIndices.add(idx);
      }
    });

    const csvLines: string[] = [];
    for (let r = 0; r < rawRows.length; r++) {
      const row = rawRows[r];
      const hasAnyValue = row.some((c) => String(c ?? '').trim() !== '');
      if (!hasAnyValue) continue;
      const cells = row.map((cell, cIdx) => {
        if (r > 0 && dateColIndices.has(cIdx)) {
          return escapeCsvCell(formatExcelDate(cell));
        }
        return escapeCsvCell(String(cell ?? '').trim());
      });
      csvLines.push(cells.join(','));
    }

    if (csvLines.length > 0) {
      sections.push(csvLines.join('\n'));
    }
  }

  return sections.join('\n\n');
}

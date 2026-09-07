export function csvEscape(value: unknown) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const body = [headers, ...rows].map((line) => line.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsv(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, '')))
    .filter((row) => row.some((cell) => cell));
}

export function privilegeLabel(admin: unknown) {
  return Number(admin) > 0 ? 'Admin' : 'User';
}

export function verifyLabel(mode: unknown) {
  const n = Number(mode);
  if (n === 8) return 'Face';
  if (n === 1) return 'Fingerprint';
  if (n === 2) return 'Card';
  if (n === 3) return 'Password';
  return mode == null || mode === '' ? 'Device' : String(mode);
}

export function mark(value: unknown) {
  const n = Number(value);
  if (n > 0) return 'Yes';
  return String(value ?? '0');
}

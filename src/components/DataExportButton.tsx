import { Button } from './Button';

export function exportCsv(filename: string, headers: string[], rows: Array<Array<string | number>>): void {
  const csv = [headers, ...rows]
    .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DataExportButton({
  filename,
  headers,
  rows,
}: {
  filename: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}) {
  return (
    <Button variant="secondary" onClick={() => exportCsv(filename, headers, rows)}>
      Export CSV
    </Button>
  );
}

export function PrintButton() {
  return (
    <Button variant="secondary" className="hidden lg:inline-flex" onClick={() => window.print()}>
      Print
    </Button>
  );
}

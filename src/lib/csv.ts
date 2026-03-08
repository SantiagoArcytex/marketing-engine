/**
 * Simple CSV parse/build for cross-reference cleaner.
 * Handles quoted fields (e.g. "a,b" stays one cell) and escaped quotes ("") inside quoted fields.
 */

export type CsvData = {
  headers: string[];
  rows: Record<string, string>[];
};

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let value = "";
      i++;
      while (i < line.length) {
        if (line[i] === '"') {
          i++;
          if (line[i] === '"') {
            value += '"';
            i++;
          } else {
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      if (line[i] === ",") i++;
    } else {
      let end = line.indexOf(",", i);
      if (end === -1) end = line.length;
      fields.push(line.slice(i, end).trim());
      i = end + 1;
    }
  }
  return fields;
}

export function parseCsv(text: string): CsvData {
  const lines: string[] = [];
  let i = 0;
  while (i < text.length) {
    let line = "";
    while (i < text.length && text[i] !== "\n" && text[i] !== "\r") {
      if (text[i] === '"') {
        line += text[i];
        i++;
        while (i < text.length) {
          if (text[i] === '"') {
            line += text[i];
            i++;
            if (text[i] === '"') {
              line += text[i];
              i++;
            } else break;
          } else {
            line += text[i];
            i++;
          }
        }
      } else {
        line += text[i];
        i++;
      }
    }
    if (text[i] === "\r") i++;
    if (text[i] === "\n") i++;
    lines.push(line);
  }
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < lines.length; r++) {
    const values = parseCsvLine(lines[r]);
    const row: Record<string, string> = {};
    headers.forEach((h, c) => {
      row[h] = values[c] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

export function parseCsvFile(file: File): Promise<CsvData> {
  return file.text().then(parseCsv);
}

function escapeCsvValue(v: string): string {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildCsv(headers: string[], rows: Record<string, string>[]): string {
  const headerLine = headers.map(escapeCsvValue).join(",");
  const dataLines = rows.map((row) => headers.map((h) => escapeCsvValue(row[h] ?? "")).join(","));
  return [headerLine, ...dataLines].join("\n");
}

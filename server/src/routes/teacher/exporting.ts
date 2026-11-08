import type { Response } from 'express';
import ExcelJS from 'exceljs';

export type Col = [header: string, key: string | ((r: any) => unknown)];

const val = (r: any, k: Col[1]) => {
  const v = typeof k === 'function' ? k(r) : r[k];
  if (v instanceof Date) return v.toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' });
  return v ?? '';
};
// Neutralise spreadsheet formula injection (=, +, -, @ at start of a cell)
const safe = (v: unknown) => { const s = String(v); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };

export async function sendTable(res: Response, format: string, name: string, cols: Col[], rows: any[]) {
  const stamp = new Date().toISOString().slice(0, 10);
  const fname = encodeURIComponent(`${name}-${stamp}`);
  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('تقرير', { views: [{ rightToLeft: true }] });
    ws.addRow(cols.map((c) => c[0])).font = { bold: true };
    for (const r of rows) ws.addRow(cols.map((c) => { const v = val(r, c[1]); return typeof v === 'number' ? v : safe(v); }));
    ws.columns.forEach((c) => { c.width = 20; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}.xlsx`);
    await wb.xlsx.write(res);
    return res.end();
  }
  const esc = (v: unknown) => `"${safe(v).replace(/"/g, '""')}"`;
  const csv = '﻿' + [cols.map((c) => esc(c[0])).join(','), ...rows.map((r) => cols.map((c) => esc(val(r, c[1]))).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fname}.csv`);
  res.send(csv);
}

import { parentPort, workerData } from 'node:worker_threads';
import * as ExcelJS from 'exceljs';

type SheetSpec = {
  sheetName: string;
  columns: { header: string; key: string; width: number }[];
  rows: Record<string, unknown>[];
};

const sheets: SheetSpec[] = workerData.sheets;

const workbook = new ExcelJS.Workbook();
workbook.creator = 'Moklet Event Hub';
workbook.created = new Date();

for (const spec of sheets) {
  const sheet = workbook.addWorksheet(spec.sheetName);
  sheet.columns = spec.columns;
  for (const row of spec.rows) {
    sheet.addRow(row);
  }
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { horizontal: 'center' };
}

workbook.xlsx.writeBuffer().then((buffer) => {
  parentPort!.postMessage(buffer);
});

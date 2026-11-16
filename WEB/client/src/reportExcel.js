import ExcelJS from "exceljs";
import { reportFileName, rupee, saveFile } from "./reportDownload.js";

const FONT = "Calibri";
const RUPEE = "₹#,##0.00;[Red]-₹#,##0.00";
const DATE_LONG = "[$-409]d-mmm-yyyy;@";
const DATE_SHORT = "mm-dd-yy";
const ACCENT = { type: "pattern", pattern: "solid", fgColor: { theme: 4 } };
const HEADER = { type: "pattern", pattern: "solid", fgColor: { theme: 4, tint: -0.249977111117893 } };
const PAPER = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFFF" } };
const medium = { style: "medium", color: { argb: "FF000000" } };
const thin = { style: "thin", color: { argb: "FF000000" } };
const BRAND_GRAY = { theme: 1, tint: 0.3499862666707358 };
const ACCENT_NAVY = { theme: 4, tint: -0.249946592608417 };
const COMPANY_NAME = "TechVatika Data Centers India Pvt. Ltd.";
const COMPANY_TAG = "Accounts";

function excelDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formula(expression, result) {
  return { formula: expression, result };
}

function paint(cell, extras = {}) {
  cell.font = {
    name: extras.fontName || FONT,
    size: extras.size || 11,
    bold: Boolean(extras.bold),
    color: extras.color,
  };
  if (extras.fill) cell.fill = extras.fill;
  if (extras.align) cell.alignment = { vertical: "middle", horizontal: extras.align, wrapText: extras.wrap || false };
  if (extras.format) cell.numFmt = extras.format;
}

function box(sheet, fromRow, fromCol, toRow, toCol) {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = fromCol; col <= toCol; col += 1) {
      const border = { top: medium, left: medium, bottom: medium, right: medium };
      sheet.getCell(row, col).border = border;
      if (!sheet.getCell(row, col).fill || sheet.getCell(row, col).fill.pattern === "none") {
        sheet.getCell(row, col).fill = PAPER;
      }
    }
  }
}

function gridBorder(sheet, fromRow, fromCol, toRow, toCol, style = thin) {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = fromCol; col <= toCol; col += 1) {
      const cell = sheet.getCell(row, col);
      cell.border = { ...cell.border, top: style, left: style, bottom: style, right: style };
    }
  }
}

function outlineBorder(sheet, fromRow, fromCol, toRow, toCol, style = medium) {
  for (let row = fromRow; row <= toRow; row += 1) {
    const left = sheet.getCell(row, fromCol);
    left.border = { ...left.border, left: style };
    const right = sheet.getCell(row, toCol);
    right.border = { ...right.border, right: style };
  }
  for (let col = fromCol; col <= toCol; col += 1) {
    const top = sheet.getCell(fromRow, col);
    top.border = { ...top.border, top: style };
    const bottom = sheet.getCell(toRow, col);
    bottom.border = { ...bottom.border, bottom: style };
  }
}

function amount(cell, value) {
  if (!value) {
    cell.value = null;
    return;
  }
  cell.value = value;
  paint(cell, { format: RUPEE, align: "right" });
}

function build(sheet, report) {
  const summary = report.kind === "summary";
  const lines = summary ? report.months : report.rows;
  const start = 8;
  const end = lines.length ? start + lines.length - 1 : start - 1;
  const brought = rupee(report.broughtForward);
  const closing = report.showStatementBalance ? rupee(report.closingBalance) : rupee(report.totals.net);

  [18, 18, 18, 18, 18, 15, 30].forEach((height, index) => {
    sheet.getRow(index + 1).height = height;
  });
  [19, 48.29, 19, 19, 24.71].forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });

  sheet.mergeCells("A1:B1");
  sheet.mergeCells("C1:D1");
  sheet.mergeCells("A2:B2");
  sheet.mergeCells("C2:D2");
  sheet.mergeCells("A3:B3");
  sheet.mergeCells("A4:B4");
  sheet.mergeCells("A5:B5");

  sheet.getCell("A1").value = COMPANY_NAME;
  paint(sheet.getCell("A1"), { bold: true, align: "left", fill: PAPER, color: BRAND_GRAY });
  sheet.getCell("A2").value = COMPANY_TAG;
  paint(sheet.getCell("A2"), { bold: true, align: "left", fill: PAPER, color: BRAND_GRAY });
  paint(sheet.getCell("A3"), { align: "left", fill: PAPER });
  sheet.getCell("C1").value = "Start Date:";
  paint(sheet.getCell("C1"), { align: "right", fill: PAPER, color: BRAND_GRAY });
  sheet.getCell("E1").value = excelDate(report.from);
  paint(sheet.getCell("E1"), { format: DATE_LONG, align: "right", color: BRAND_GRAY });
  sheet.getCell("C2").value = "Today:";
  paint(sheet.getCell("C2"), { align: "right", fill: PAPER, color: BRAND_GRAY });
  sheet.getCell("E2").value = formula("TODAY()", new Date());
  paint(sheet.getCell("E2"), { format: DATE_LONG, align: "right", color: BRAND_GRAY });

  ["TOTAL IN", "TOTAL OUT", "NET BALANCE"].forEach((label, index) => {
    const cell = sheet.getCell(3, index + 3);
    cell.value = label;
    paint(cell, { align: "center", fill: ACCENT });
  });

  sheet.getCell("A4").value = summary ? "MONTHLY SUMMARY" : "STATEMENT OF ACCOUNT";
  paint(sheet.getCell("A4"), { fontName: "Calibri Light", size: 12, bold: true, align: "center", fill: PAPER, color: ACCENT_NAVY });
  sheet.getCell("A5").value = COMPANY_NAME;
  paint(sheet.getCell("A5"), { align: "center", fill: PAPER, color: ACCENT_NAVY });
  sheet.getCell("C5").value = summary ? "MONTHS" : "TRANSACTIONS";
  paint(sheet.getCell("C5"), { bold: true, align: "left" });

  if (report.showStatementBalance) {
    sheet.mergeCells("A6:D6");
    sheet.getCell("A6").value = "Brought forward";
    paint(sheet.getCell("A6"), { align: "left", fill: PAPER });
    sheet.getCell("E6").value = brought;
    paint(sheet.getCell("E6"), { format: RUPEE, align: "right", bold: true });
  } else {
    sheet.mergeCells("A6:E6");
    paint(sheet.getCell("A6"), { fill: PAPER });
  }

  box(sheet, 1, 1, 2, 2);
  box(sheet, 4, 1, 5, 2);
  gridBorder(sheet, 3, 3, 3, 5);
  gridBorder(sheet, 4, 3, 5, 5);
  gridBorder(sheet, 6, 1, 6, 5);

  const heads = summary
    ? ["MONTH", "ENTRIES", "Credit", "Debit", "BALANCE"]
    : ["DATE", "DESCRIPTION", "Credit", "Debit", "BALANCE"];
  heads.forEach((label, index) => {
    const cell = sheet.getCell(7, index + 1);
    cell.value = label;
    paint(cell, { bold: true, align: "center", fill: HEADER });
  });
  gridBorder(sheet, 7, 1, 7, 5);

  const creditTotal = lines.length ? formula(`SUM(C${start}:C${end})`, rupee(report.totals.credit)) : 0;
  const debitTotal = lines.length ? formula(`SUM(D${start}:D${end})`, rupee(report.totals.debit)) : 0;
  sheet.getCell("C4").value = creditTotal;
  sheet.getCell("D4").value = debitTotal;
  paint(sheet.getCell("C4"), { format: RUPEE, align: "left" });
  paint(sheet.getCell("D4"), { format: RUPEE, align: "left" });
  sheet.getCell("E4").value = lines.length
    ? formula(report.showStatementBalance ? "E6+C4-D4" : "C4-D4", closing)
    : (report.showStatementBalance ? brought : 0);
  paint(sheet.getCell("E4"), { format: RUPEE, align: "left", bold: true });

  if (lines.length) {
    sheet.getCell("D5").value = formula(`COUNTIF(A${start}:A${end},"<>")`, report.totals.count);
    sheet.getCell("E5").value = summary
      ? formula(`SUM(B${start}:B${end})`, report.totals.count)
      : formula(`COUNTIFS(C${start}:C${end},">0",D${start}:D${end},">0")`, 0);
    paint(sheet.getCell("D5"), { align: "left" });
    paint(sheet.getCell("E5"), { align: "left" });
  } else {
    sheet.getCell("D5").value = 0;
    sheet.getCell("E5").value = 0;
  }

  if (!lines.length) {
    sheet.getCell("A8").value = "No lines in this period.";
    paint(sheet.getCell("A8"), { align: "left" });
    sheet.mergeCells("A8:E8");
    gridBorder(sheet, 8, 1, 8, 5);
    outlineBorder(sheet, 1, 1, 8, 5);
    return;
  }

  lines.forEach((line, index) => {
    const row = start + index;
    sheet.getRow(row).height = 30;
    if (summary) {
      sheet.getCell(row, 1).value = line.label;
      paint(sheet.getCell(row, 1), { align: "center" });
      sheet.getCell(row, 2).value = line.count;
      paint(sheet.getCell(row, 2), { align: "center" });
      sheet.getCell(row, 3).value = rupee(line.credit);
      sheet.getCell(row, 4).value = rupee(line.debit);
      sheet.getCell(row, 5).value = rupee(line.closingBalance);
    } else {
      sheet.getCell(row, 1).value = excelDate(line.date);
      paint(sheet.getCell(row, 1), { format: DATE_SHORT, align: "center" });
      sheet.getCell(row, 2).value = line.description;
      paint(sheet.getCell(row, 2), { align: "left" });
      amount(sheet.getCell(row, 3), rupee(line.credit));
      amount(sheet.getCell(row, 4), rupee(line.debit));
      const balance = rupee(line.balance);
      sheet.getCell(row, 5).value = report.showStatementBalance
        ? formula(`IF(COUNTA(C${row}:D${row})=0,"",$E$6+SUM($C$8:C${row})-SUM($D$8:D${row}))`, balance)
        : balance;
    }
    paint(sheet.getCell(row, 3), { format: RUPEE, align: "right" });
    paint(sheet.getCell(row, 4), { format: RUPEE, align: "right" });
    paint(sheet.getCell(row, 5), { format: RUPEE, align: "right" });
  });

  gridBorder(sheet, start, 1, end, 5);
  outlineBorder(sheet, 1, 1, end, 5);
}

function sheetName(name, taken) {
  const base = String(name || "Book").replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Book";
  let candidate = base;
  let suffix = 2;
  while (taken.has(candidate.toLowerCase())) {
    const tail = ` (${suffix})`;
    candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
    suffix += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

function addReportSheet(workbook, name, report) {
  const sheet = workbook.addWorksheet(name, {
    properties: { tabColor: { theme: 4, tint: -0.249977111117893 } },
    views: [{
      showGridLines: false,
      state: "frozen",
      xSplit: 1,
      ySplit: 7,
      topLeftCell: "B8",
      zoomScale: 100,
      activeCell: "A8",
    }],
  });
  build(sheet, report);
  sheet.pageSetup = {
    paperSize: 9,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    pageOrder: "downThenOver",
    margins: { left: 0.98, right: 0.2, top: 0.59, bottom: 0.98, header: 0, footer: 0 },
  };
  sheet.pageSetup.printTitlesRow = "7:7";
  return sheet;
}

function newWorkbook(title, subject) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Balancio";
  workbook.company = "Balancio";
  workbook.title = title;
  workbook.subject = subject;
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
}

export async function excelBytes(report) {
  const workbook = newWorkbook(`${report.title} · ${report.period}`, report.included);
  addReportSheet(workbook, "Balancio", report);
  return workbook.xlsx.writeBuffer();
}

/** One workbook, one sheet per book — entries: [{ name, report }]. */
export async function multiBookExcelBytes(entries) {
  const first = entries[0]?.report;
  const workbook = newWorkbook(`${first?.title ?? "Balancio"} · ${first?.period ?? ""}`, "All books");
  const taken = new Set();
  for (const entry of entries) {
    addReportSheet(workbook, sheetName(entry.name, taken), entry.report);
  }
  return workbook.xlsx.writeBuffer();
}

export async function saveMultiBookExcelReport(entries) {
  const bytes = await multiBookExcelBytes(entries);
  const first = entries[0]?.report;
  saveFile(
    bytes,
    reportFileName(first, "xlsx"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

export async function saveExcelReport(report) {
  const bytes = await excelBytes(report);
  saveFile(
    bytes,
    reportFileName(report, "xlsx"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

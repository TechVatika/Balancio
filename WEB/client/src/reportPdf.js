import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatRupee } from "../../shared/money.js";
import { formatDisplayDate } from "../../shared/statement.js";
import { logoDataUrl, reportFileName, rupee, saveFile } from "./reportDownload.js";

const FONT = "SourceSans";
const GUJARATI_FONT = "NotoGujarati";
const FACES = [
  ["SourceSans3-Regular.ttf", FONT, "normal"],
  ["SourceSans3-Bold.ttf", FONT, "bold"],
  ["SourceSans3-It.ttf", FONT, "italic"],
  ["NotoSansGujarati-Regular.ttf", GUJARATI_FONT, "normal"],
  ["NotoSansGujarati-Bold.ttf", GUJARATI_FONT, "bold"],
];
const fontCache = new Map();
const GUJARATI_PATTERN = /[઀-૿]/;

function hasGujarati(text) {
  return GUJARATI_PATTERN.test(String(text ?? ""));
}

const NAVY = [18, 34, 54];
const MUTED = [91, 107, 124];
const LINE = [217, 225, 234];
const PAPER = [244, 247, 251];
const CREDIT = [6, 118, 71];
const DEBIT = [180, 35, 24];

function money(value, empty = false) {
  return formatRupee(value, { empty });
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

async function fontBase64(file) {
  const cached = fontCache.get(file);
  if (cached) return cached;
  const response = await fetch(`/fonts/${file}`);
  if (!response.ok) throw new Error("The report font could not be loaded.");
  const encoded = bytesToBase64(new Uint8Array(await response.arrayBuffer()));
  fontCache.set(file, encoded);
  return encoded;
}

async function useRupeeFont(doc) {
  for (const [file, family, style] of FACES) {
    doc.addFileToVFS(file, await fontBase64(file));
    doc.addFont(file, family, style);
  }
  doc.setFont(FONT, "normal");
}

function tone(value) {
  return rupee(value) < 0 ? DEBIT : NAVY;
}

function drawBanner(doc, report, logo) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, width, 28, "F");
  doc.addImage(logo, "PNG", 10, 5, 18, 18);
  doc.setTextColor(255, 255, 255);
  doc.setFont(FONT, "bold");
  doc.setFontSize(18);
  doc.text("Balancio", 32, 13);
  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  doc.setTextColor(213, 221, 230);
  doc.text("Your money, in balance.", 32, 20);

  doc.setTextColor(...NAVY);
  doc.setFont(FONT, "bold");
  doc.setFontSize(16);
  doc.text(report.title, 14, 40);
  doc.setFont(FONT, "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`${report.period}   ·   ${report.included}`, 14, 47);
}

function drawFigures(doc, report) {
  const figures = [
    ["In", money(report.totals.credit), rupee(report.totals.credit) ? CREDIT : NAVY],
    ["Out", money(report.totals.debit), rupee(report.totals.debit) ? DEBIT : NAVY],
    [
      report.showStatementBalance ? "Closing balance" : "Net of shown lines",
      money(report.showStatementBalance ? report.closingBalance : report.totals.net),
      tone(report.showStatementBalance ? report.closingBalance : report.totals.net),
    ],
  ];
  const width = doc.internal.pageSize.getWidth();
  const gap = 4;
  const boxWidth = (width - 28 - gap * 2) / 3;
  figures.forEach((figure, index) => {
    const x = 14 + index * (boxWidth + gap);
    doc.setDrawColor(...LINE);
    doc.setFillColor(247, 249, 252);
    doc.rect(x, 54, boxWidth, 18, "FD");
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(figure[0].toUpperCase(), x + 3, 60);
    doc.setFont(FONT, "bold");
    let size = 12;
    doc.setFontSize(size);
    while (doc.getTextWidth(figure[1]) > boxWidth - 6 && size > 8) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    doc.setTextColor(...figure[2]);
    doc.text(figure[1], x + 3, 68);
  });
}

function paintAmount(data, creditColumn, debitColumn) {
  if (data.section === "head") return;
  const text = String(data.cell.raw ?? "");
  if (text === "—" || text === "₹0.00") return;
  if (data.column.index === creditColumn) data.cell.styles.textColor = CREDIT;
  if (data.column.index === debitColumn || text.startsWith("−")) data.cell.styles.textColor = DEBIT;
}

function paintScript(data) {
  if (data.section === "head") return;
  if (hasGujarati(data.cell.raw)) {
    data.cell.styles.font = GUJARATI_FONT;
  }
}

function finish(doc, report, logo) {
  const pages = doc.getNumberOfPages();
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    if (page > 1) {
      doc.addImage(logo, "PNG", 14, 3.5, 7, 7);
      doc.setFont(FONT, "bold");
      doc.setFontSize(9);
      doc.setTextColor(...NAVY);
      doc.text(`Balancio  ·  ${report.title}`, 23, 8);
    }
    doc.setFont(FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Your personal ledger. Credit is money in, debit is money out.", 14, height - 8);
    doc.text(`${page} / ${pages}`, width - 14, height - 8, { align: "right" });
  }
}

function statementTable(doc, report) {
  if (!report.rows.length) {
    doc.setFont(FONT, "italic");
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text("No lines in this period.", 14, 84);
    return;
  }
  const body = [];
  if (report.showStatementBalance) {
    body.push(["", "Brought forward", "—", "—", money(report.broughtForward)]);
  }
  for (const row of report.rows) {
    body.push([
      formatDisplayDate(row.date),
      row.description,
      money(row.credit, true),
      money(row.debit, true),
      money(row.balance),
    ]);
  }
  const count = report.totals.count;
  autoTable(doc, {
    startY: 80,
    margin: { top: 16, right: 14, bottom: 16, left: 14 },
    head: [["Date", "Description", "Credit", "Debit", "Balance"]],
    body,
    foot: [[
      `${report.showStatementBalance ? "Period total" : "Shown"} · ${count} ${count === 1 ? "entry" : "entries"}`,
      "",
      money(report.totals.credit),
      money(report.totals.debit),
      money(report.showStatementBalance ? report.closingBalance : report.totals.net),
    ]],
    theme: "plain",
    styles: { font: FONT, fontSize: 9, textColor: NAVY, cellPadding: { top: 2.4, right: 2, bottom: 2.4, left: 2 }, lineColor: LINE, lineWidth: 0.1 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: PAPER, textColor: NAVY, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 64 },
      2: { halign: "right", cellWidth: 32 },
      3: { halign: "right", cellWidth: 32 },
      4: { halign: "right", cellWidth: 30, fontStyle: "bold" },
    },
    showHead: "everyPage",
    didParseCell: (data) => {
      paintAmount(data, 2, 3);
      paintScript(data);
      if (data.section === "body" && report.showStatementBalance && data.row.index === 0) {
        data.cell.styles.textColor = MUTED;
        data.cell.styles.fontStyle = "italic";
      }
    },
  });
}

function summaryTable(doc, report) {
  if (!report.months.length) {
    doc.setFont(FONT, "italic");
    doc.setFontSize(11);
    doc.setTextColor(...MUTED);
    doc.text("No lines in this period.", 14, 84);
    return;
  }
  const body = report.months.map((month) => [
    month.label,
    money(month.credit),
    money(month.debit),
    money(month.net),
    money(month.closingBalance),
    String(month.count),
  ]);
  autoTable(doc, {
    startY: 80,
    margin: { top: 16, right: 14, bottom: 18, left: 14 },
    head: [["Month", "In", "Out", "Net", "Balance", "Entries"]],
    body,
    foot: [[
      "Total",
      money(report.totals.credit),
      money(report.totals.debit),
      money(report.totals.net),
      money(report.closingBalance),
      String(report.totals.count),
    ]],
    theme: "plain",
    styles: { font: FONT, fontSize: 9, textColor: NAVY, cellPadding: { top: 2.6, right: 2, bottom: 2.6, left: 2 }, lineColor: LINE, lineWidth: 0.1 },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: PAPER, textColor: NAVY, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 36 },
      1: { halign: "right", cellWidth: 30 },
      2: { halign: "right", cellWidth: 30 },
      3: { halign: "right", cellWidth: 30 },
      4: { halign: "right", cellWidth: 32, fontStyle: "bold" },
      5: { halign: "right", cellWidth: 24 },
    },
    showHead: "everyPage",
    didParseCell: (data) => paintAmount(data, 1, 2),
  });
  const note = report.showStatementBalance
    ? "Balance is where the book stood at the end of each month. The total balance is the book at the end of the period."
    : "In and out follow the lines you included. Balance is the book at the end of that month.";
  const y = doc.lastAutoTable.finalY + 8;
  doc.setFont(FONT, "italic");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(note, 14, Math.min(y, doc.internal.pageSize.getHeight() - 16), { maxWidth: doc.internal.pageSize.getWidth() - 28 });
}

export async function pdfBytes(report) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await useRupeeFont(doc);
  const logo = await logoDataUrl();
  doc.setProperties({
    title: `Balancio ${report.title}`,
    subject: `${report.period}. ${report.included}.`,
    author: "Balancio",
    creator: "Balancio",
  });
  drawBanner(doc, report, logo);
  drawFigures(doc, report);
  if (report.kind === "summary") summaryTable(doc, report);
  else statementTable(doc, report);
  finish(doc, report, logo);
  return doc.output("arraybuffer");
}

export async function savePdfReport(report) {
  saveFile(await pdfBytes(report), reportFileName(report, "pdf"), "application/pdf");
}

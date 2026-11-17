import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatRupee } from "../../shared/money.js";
import { formatDisplayDate } from "../../shared/statement.js";
import { logoDataUrl, reportFileName, rupee, saveFile } from "./reportDownload.js";

const FONT = "IBMPlex";
const DISPLAY = "SourceSerif";
const GUJARATI_FONT = "NotoSerifGujarati";
const FACES = [
  ["IBMPlexSans-Regular.ttf", FONT, "normal"],
  ["IBMPlexSans-Medium.ttf", FONT, "medium"],
  ["IBMPlexSans-Bold.ttf", FONT, "bold"],
  ["SourceSerif4-Bold.ttf", DISPLAY, "bold"],
  ["NotoSerifGujarati-Regular.ttf", GUJARATI_FONT, "normal"],
  ["NotoSerifGujarati-Bold.ttf", GUJARATI_FONT, "bold"],
];
const fontCache = new Map();
const GUJARATI_PATTERN = /[઀-૿]/;

function hasGujarati(text) {
  return GUJARATI_PATTERN.test(String(text ?? ""));
}

const NAVY = [18, 34, 54];
const TAG = [183, 195, 209];
const MUTED = [91, 107, 124];
const LINE = [217, 225, 234];
const PAPER = [244, 247, 251];
const CREDIT = [6, 118, 71];
const DEBIT = [180, 35, 24];
const GLOW_PAD = 96;
const LOGO_PX = 256;

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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The Balancio logo could not be loaded."));
    image.src = src;
  });
}

async function brandLogo(dataUrl) {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const side = LOGO_PX + GLOW_PAD * 2;
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d");
  const origin = GLOW_PAD;
  const paintGlow = (blur, alpha) => {
    ctx.save();
    ctx.shadowColor = `rgba(255, 255, 255, ${alpha})`;
    ctx.shadowBlur = blur;
    ctx.drawImage(image, origin, origin, LOGO_PX, LOGO_PX);
    ctx.restore();
  };
  // Match .mark drop-shadow(0 0 2px …) drop-shadow(0 0 7px …) on the navy rail.
  paintGlow(12, 0.95);
  paintGlow(43, 0.8);
  ctx.drawImage(image, origin, origin, LOGO_PX, LOGO_PX);
  return canvas.toDataURL("image/png");
}

function placeBrandLogo(doc, logo, x, y, size) {
  const scale = size / LOGO_PX;
  const full = (LOGO_PX + GLOW_PAD * 2) * scale;
  const pad = GLOW_PAD * scale;
  doc.addImage(logo, "PNG", x - pad, y - pad, full, full);
}

function drawBrandLockup(doc, logo, x, y, size) {
  placeBrandLogo(doc, logo, x, y, size);
  const textX = x + size + size * 0.23;
  doc.setTextColor(255, 255, 255);
  doc.setFont(DISPLAY, "bold");
  doc.setFontSize(size * 1.2);
  doc.text("Balancio", textX, y + size * 0.42);
  doc.setFont(FONT, "medium");
  doc.setFontSize(size * 0.65);
  doc.setTextColor(...TAG);
  doc.text("Your money, in balance.", textX, y + size * 0.84);
}

function drawBanner(doc, report, logo) {
  const width = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, width, 28, "F");
  drawBrandLockup(doc, logo, 10, 5, 18);

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
      doc.setFillColor(...NAVY);
      doc.rect(0, 0, width, 16, "F");
      drawBrandLockup(doc, logo, 14, 3, 10);
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
    doc.setFont(FONT, "normal");
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
    margin: { top: 20, right: 14, bottom: 16, left: 14 },
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
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 10 },
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
        data.cell.styles.fontStyle = "normal";
      }
    },
  });
}

function summaryTable(doc, report) {
  if (!report.months.length) {
    doc.setFont(FONT, "normal");
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
    margin: { top: 20, right: 14, bottom: 18, left: 14 },
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
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold", fontSize: 10 },
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
  doc.setFont(FONT, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(note, 14, Math.min(y, doc.internal.pageSize.getHeight() - 16), { maxWidth: doc.internal.pageSize.getWidth() - 28 });
}

export async function pdfBytes(report) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await useRupeeFont(doc);
  const logo = await brandLogo(await logoDataUrl());
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

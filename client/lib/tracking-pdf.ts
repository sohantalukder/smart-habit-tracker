import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { TrackingReport } from "./api/types";

const forest: [number, number, number] = [21, 56, 47];
const deepForest: [number, number, number] = [12, 37, 32];
const ivory: [number, number, number] = [243, 239, 228];
const paper: [number, number, number] = [251, 248, 239];
const sage: [number, number, number] = [217, 223, 209];
const brass: [number, number, number] = [185, 140, 66];
const ink: [number, number, number] = [23, 33, 30];
const muted: [number, number, number] = [95, 107, 101];
const rule: [number, number, number] = [200, 193, 174];

export function createTrackingPdf(report: TrackingReport) {
  const document = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();

  drawSummary(document, report);
  autoTable(document, {
    startY: 70,
    margin: { top: 31, right: 14, bottom: 18, left: 14 },
    head: [[
      "Date",
      "Habit",
      "Status",
      "Value",
      "Unit",
      "Daily",
      "Today's win",
      "Tomorrow's adjustment",
    ]],
    body: report.days.flatMap((day) =>
      day.habits.map((habit) => [
        day.date,
        habit.name,
        statusLabel(habit.status),
        habit.value == null ? "-" : String(habit.value),
        habit.unit ?? "-",
        `${day.completionRate}%`,
        day.winNote || "-",
        day.reflectionNote || "-",
      ])
    ),
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.6,
      cellPadding: { top: 3.1, right: 2.4, bottom: 3.1, left: 2.4 },
      lineColor: rule,
      lineWidth: 0.18,
      textColor: ink,
      valign: "middle",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: forest,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 7.5,
      minCellHeight: 10,
    },
    alternateRowStyles: { fillColor: paper },
    columnStyles: {
      0: { cellWidth: 21, fontStyle: "bold" },
      1: { cellWidth: 38 },
      2: { cellWidth: 22 },
      3: { cellWidth: 14, halign: "right" },
      4: { cellWidth: 18 },
      5: { cellWidth: 15, halign: "right", fontStyle: "bold" },
      6: { cellWidth: 69 },
      7: { cellWidth: 72 },
    },
    didDrawPage: ({ pageNumber }) => {
      drawBrandHeader(document, report, pageWidth);
      drawFooter(document, pageNumber, pageWidth, pageHeight);
    },
  });

  document.setProperties({
    title: `Bloom tracking report - ${report.from} to ${report.to}`,
    subject: "Private habit tracking report",
    author: "Bloom",
    creator: "Bloom",
    keywords: "Bloom, habits, tracking, private report",
  });
  return document;
}

export function trackingPdfBytes(report: TrackingReport) {
  return new Uint8Array(createTrackingPdf(report).output("arraybuffer"));
}

export function trackingPdfFileName(report: TrackingReport) {
  return `bloom-tracking-${report.from}-to-${report.to}.pdf`;
}

function drawBrandHeader(document: jsPDF, report: TrackingReport, pageWidth: number) {
  document.setFillColor(...deepForest);
  document.rect(0, 0, pageWidth, 24, "F");

  document.setFillColor(...ivory);
  document.roundedRect(14, 5, 14, 14, 3, 3, "F");
  document.setDrawColor(...brass);
  document.setLineWidth(0.8);
  document.line(21, 15.5, 21, 10.4);
  document.ellipse(18.8, 10.6, 2.3, 1.5, "S");
  document.ellipse(23.3, 8.9, 2.3, 1.5, "S");
  document.line(21, 11.4, 18.9, 10.5);
  document.line(21, 10.4, 23.1, 9.1);

  document.setTextColor(255, 255, 255);
  document.setFont("helvetica", "bold");
  document.setFontSize(17);
  document.text("Bloom", 33, 12.7);
  document.setTextColor(190, 211, 201);
  document.setFont("helvetica", "normal");
  document.setFontSize(7);
  document.text("PRIVATE HABIT REPORT", 33.2, 17);

  document.setTextColor(255, 255, 255);
  document.setFont("helvetica", "bold");
  document.setFontSize(9);
  document.text("Tracking report", pageWidth - 14, 10, { align: "right" });
  document.setTextColor(190, 211, 201);
  document.setFont("helvetica", "normal");
  document.setFontSize(7.5);
  document.text(`${formatDate(report.from)} - ${formatDate(report.to)}`, pageWidth - 14, 15.3, {
    align: "right",
  });
}

function drawSummary(document: jsPDF, report: TrackingReport) {
  const cards: Array<[string, string]> = [
    ["Completion", `${report.completionRate}%`],
    ["Promises kept", String(report.totalCompleted)],
    ["Scheduled", String(report.totalScheduled)],
    ["Days included", String(report.days.length)],
  ];
  const cardWidth = 42;
  const gap = 4;
  cards.forEach(([label, value], index) => {
    const x = 14 + index * (cardWidth + gap);
    document.setFillColor(...sage);
    document.setDrawColor(...rule);
    document.setLineWidth(0.2);
    document.roundedRect(x, 32, cardWidth, 25, 2, 2, "FD");
    document.setTextColor(...muted);
    document.setFont("helvetica", "bold");
    document.setFontSize(6.8);
    document.text(label.toUpperCase(), x + 4, 39.5);
    document.setTextColor(...forest);
    document.setFontSize(16);
    document.text(value, x + 4, 50.2);
  });

  document.setTextColor(...muted);
  document.setFont("helvetica", "normal");
  document.setFontSize(7.5);
  document.text(
    `Generated ${new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date())}`,
    document.internal.pageSize.getWidth() - 14,
    39,
    { align: "right" },
  );
  document.setTextColor(...ink);
  document.setFont("helvetica", "bold");
  document.setFontSize(11);
  document.text("Consistency, recorded honestly.", document.internal.pageSize.getWidth() - 14, 49, {
    align: "right",
  });
  document.setTextColor(...muted);
  document.setFont("helvetica", "normal");
  document.setFontSize(7);
  document.text("Based only on saved check-ins and private reflections.", document.internal.pageSize.getWidth() - 14, 54, {
    align: "right",
  });
}

function drawFooter(
  document: jsPDF,
  pageNumber: number,
  pageWidth: number,
  pageHeight: number,
) {
  document.setDrawColor(...rule);
  document.setLineWidth(0.2);
  document.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);
  document.setTextColor(...muted);
  document.setFont("helvetica", "normal");
  document.setFontSize(7);
  document.text("Bloom Habit Tracker", 14, pageHeight - 7);
  document.text(`Page ${pageNumber}`, pageWidth - 14, pageHeight - 7, { align: "right" });
}

function statusLabel(status: string) {
  return status
    .split("_")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}

"use client";

import {
  CalendarRange,
  CircleAlert,
  Download,
  FileSpreadsheet,
  LoaderCircle,
  RotateCcw,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { TrackingReport } from "@/lib/api/types";
import { localDateString } from "@/lib/dashboard";
import {
  offsetLocalDate,
  trackingCsv,
  trackingFileName,
} from "@/lib/tracking-export";

type Preset = "day" | "week" | "month" | "custom";

export function HistoryPage() {
  const today = useMemo(() => localDateString(), []);
  const [preset, setPreset] = useState<Preset>("week");
  const [from, setFrom] = useState(() => offsetLocalDate(today, -6));
  const [to, setTo] = useState(today);
  const [report, setReport] = useState<TrackingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<"" | "csv" | "pdf">("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!from || !to || from > to) {
      setError("Choose a valid start and end date.");
      setReport(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setReport(await apiRequest<TrackingReport>(`/tracking?from=${from}&to=${to}`));
    } catch (reason) {
      setReport(null);
      setError(reason instanceof Error ? reason.message : "Your tracking history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  function choosePreset(next: Preset) {
    setPreset(next);
    if (next === "day") {
      setFrom(today);
      setTo(today);
    } else if (next === "week") {
      setFrom(offsetLocalDate(today, -6));
      setTo(today);
    } else if (next === "month") {
      setFrom(offsetLocalDate(today, -29));
      setTo(today);
    }
  }

  function downloadCsv() {
    if (!report || report.totalScheduled === 0) return;
    setDownloading("csv");
    try {
      const blob = new Blob(
        [`\uFEFF${trackingCsv(report)}`],
        { type: "text/csv;charset=utf-8" },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = trackingFileName(report);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setDownloading("");
    }
  }

  async function downloadPdf() {
    if (!report || report.totalScheduled === 0) return;
    setDownloading("pdf");
    try {
      const {
        trackingPdfBytes,
        trackingPdfFileName,
      } = await import("@/lib/tracking-pdf");
      const bytes = trackingPdfBytes(report);
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = trackingPdfFileName(report);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setDownloading("");
    }
  }

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <p>YOUR RECORD</p>
          <h1>History & export</h1>
          <span>Review the pattern, choose any date range, and download your own tracking data.</span>
        </div>
      </header>

      <section className="range-card" aria-labelledby="range-title">
        <div className="range-card__title">
          <span><CalendarRange /></span>
          <div><h2 id="range-title">Choose a date range</h2><p>Exports are generated only from your saved check-ins.</p></div>
        </div>
        <div className="range-presets" role="group" aria-label="Date range presets">
          {([
            ["day", "1 day"],
            ["week", "Last 7 days"],
            ["month", "Last 30 days"],
            ["custom", "Custom dates"],
          ] as const).map(([value, label]) => (
            <button
              type="button"
              className={preset === value ? "active" : ""}
              aria-pressed={preset === value}
              onClick={() => choosePreset(value)}
              key={value}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="range-inputs">
          <label>From<input type="date" value={from} max={to || today} onChange={(event) => { setPreset("custom"); setFrom(event.target.value); }} /></label>
          <span>to</span>
          <label>To<input type="date" value={to} min={from} max={today} onChange={(event) => { setPreset("custom"); setTo(event.target.value); }} /></label>
          <div className="export-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={!report || report.totalScheduled === 0 || Boolean(downloading) || loading}
              onClick={downloadCsv}
            >
              {downloading === "csv" ? <LoaderCircle className="spin" /> : <FileSpreadsheet />}
              Download CSV
            </button>
            <button
              type="button"
              className="primary-action"
              disabled={!report || report.totalScheduled === 0 || Boolean(downloading) || loading}
              onClick={() => void downloadPdf()}
            >
              {downloading === "pdf" ? <LoaderCircle className="spin" /> : <Download />}
              Download PDF
            </button>
          </div>
        </div>
        <p className="range-privacy"><FileSpreadsheet /> PDF includes Bloom branding and page numbers. CSV remains available for Excel, Google Sheets, and Numbers.</p>
      </section>

      {loading ? (
        <div className="page-loading"><span /><span /><span /></div>
      ) : error ? (
        <section className="page-error" role="alert">
          <CircleAlert />
          <div><strong>We couldn’t build this report.</strong><span>{error}</span></div>
          <button type="button" onClick={() => void load()}><RotateCcw /> Try again</button>
        </section>
      ) : report ? (
        <>
          <section className="report-summary" aria-label="Range summary">
            <article><span>Completion</span><strong>{report.completionRate}%</strong></article>
            <article><span>Promises kept</span><strong>{report.totalCompleted}</strong></article>
            <article><span>Scheduled</span><strong>{report.totalScheduled}</strong></article>
            <article><span>Days</span><strong>{report.days.length}</strong></article>
          </section>
          <section className="history-days" aria-labelledby="history-days-title">
            <div className="section-heading-compact">
              <div><p>DAY BY DAY</p><h2 id="history-days-title">Your consistency</h2></div>
              <span>{friendlyRange(report.from, report.to)}</span>
            </div>
            {report.totalScheduled === 0 ? (
              <div className="journal-empty">
                <CalendarRange />
                <h3>No scheduled habits in this range.</h3>
                <p>Choose another range or add a habit to begin building your history.</p>
              </div>
            ) : (
              <div className="history-day-list">
                {[...report.days].reverse().map((day) => (
                  <article key={day.date}>
                    <time dateTime={day.date}>
                      <strong>{new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(new Date(`${day.date}T12:00:00`))}</strong>
                      <span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${day.date}T12:00:00`))}</span>
                    </time>
                    <div>
                      <span><i style={{ width: `${day.completionRate}%` }} /></span>
                      <small>{day.completed} of {day.scheduled} complete</small>
                    </div>
                    <strong>{day.completionRate}%</strong>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function friendlyRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (from === to) return formatter.format(new Date(`${from}T12:00:00`));
  return `${formatter.format(new Date(`${from}T12:00:00`))} – ${formatter.format(new Date(`${to}T12:00:00`))}`;
}

"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { BellRing, Check, Clock3, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/lib/api";
import { idempotentInit } from "@/lib/api";
import {
  appQueries,
  queryKeys,
  type PrayerName,
  type PrayerSchedule,
  type PrayerStatus,
} from "@/lib/queries";

export function PrayerPanel({ localDate }: { localDate: string }) {
  const queryClient = useQueryClient();
  const scheduleQuery = useQuery(appQueries.prayer(localDate));
  const schedule = scheduleQuery.data ?? null;
  const loading = scheduleQuery.isPending;
  const error = scheduleQuery.error instanceof Error && !scheduleQuery.data
    ? scheduleQuery.error.message
    : scheduleQuery.error && !scheduleQuery.data
      ? "Prayer times could not be loaded."
      : "";
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown = useMemo(
    () => schedule?.nextPrayer
      ? countdownLabel(new Date(schedule.nextPrayer.time).getTime() - now)
      : "",
    [now, schedule?.nextPrayer],
  );

  const statusMutation = useMutation({
    mutationFn: ({ prayer, status }: {
      prayer: PrayerName;
      status: PrayerStatus;
    }) =>
      apiRequest(
        `/prayers/${prayer}/logs/${localDate}`,
        idempotentInit("PUT", { status }),
      ),
    onSuccess: (_result, { prayer, status }) => {
      queryClient.setQueryData<PrayerSchedule>(
        queryKeys.user.prayer(localDate),
        (current) => current ? {
        ...current,
        prayers: current.prayers.map((item) =>
          item.name === prayer ? { ...item, status } : item
        ),
      } : current,
      );
      void queryClient.invalidateQueries({
        queryKey: queryKeys.user.prayer(localDate),
      });
      toast.success(`${titleCase(prayer)} recorded as ${status.replace("_", " ")}.`);
    },
    onError: (reason) => {
      toast.error(reason instanceof Error ? reason.message : "Prayer status could not be saved.");
    },
  });

  function setStatus(prayer: PrayerName, status: PrayerStatus) {
    if (!statusMutation.isPending) {
      statusMutation.mutate({ prayer, status });
    }
  }

  return (
    <section className="prayer-panel" id="prayers" aria-labelledby="prayer-panel-title">
      <div className="honest-section-title">
        <div><p>PRAYER TIMES</p><h2 id="prayer-panel-title">Today’s prayers</h2></div>
        {schedule?.nextPrayer && (
          <span className="next-prayer-badge">
            <Clock3 aria-hidden="true" />
            <span>
              <small>Next prayer</small>
              <strong>{titleCase(schedule.nextPrayer.name)}</strong>
            </span>
            <time dateTime={schedule.nextPrayer.time}>in {countdown}</time>
          </span>
        )}
      </div>
      {loading ? (
        <div className="prayer-loading"><LoaderCircle className="spin" /> Calculating prayer times…</div>
      ) : error || !schedule ? (
        <div className="prayer-error">
          <span>{error || "Prayer setup is incomplete."}</span>
          <button onClick={() => void scheduleQuery.refetch()}><RefreshCw size={14} /> Retry</button>
        </div>
      ) : (
        <>
          <div className="prayer-grid">
            {schedule.prayers.map((prayer) => {
              const isNext = schedule.nextPrayer?.name === prayer.name
                && schedule.nextPrayer.time === prayer.time;
              return (
                <article className={isNext ? "next" : ""} key={prayer.name}>
                  <header>
                    <span>{isNext ? <BellRing size={17} /> : <Clock3 size={17} />}</span>
                    <div>
                      <strong>{titleCase(prayer.name)}</strong>
                      <time>{formatPrayerTime(prayer.time, schedule.timezone)}</time>
                    </div>
                  </header>
                  <div className="prayer-statuses" aria-label={`Track ${prayer.name}`}>
                    {(["on_time", "late", "missed"] as PrayerStatus[]).map((status) => (
                      <button
                        type="button"
                        className={prayer.status === status ? "selected" : ""}
                        disabled={statusMutation.isPending
                          && statusMutation.variables?.prayer === prayer.name}
                        onClick={() => setStatus(prayer.name, status)}
                        key={status}
                      >
                        {prayer.status === status && <Check size={11} />}
                        {status.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
          <small className="prayer-method-note">
            {titleCase(schedule.madhab)} · {methodLabel(schedule.calculationMethod)} · {schedule.timezone}
          </small>
        </>
      )}
    </section>
  );
}

function formatPrayerTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function countdownLabel(milliseconds: number) {
  if (milliseconds <= 0) return "now";
  const totalMinutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!hours) return `${minutes}m`;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function titleCase(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1).replaceAll("_", " ")}`;
}

function methodLabel(value: string) {
  const labels: Record<string, string> = {
    karachi: "Karachi",
    muslim_world_league: "Muslim World League",
    egyptian: "Egyptian",
    umm_al_qura: "Umm al-Qura",
    moonsighting_committee: "Moonsighting Committee",
    north_america: "North America",
  };
  return labels[value] ?? titleCase(value);
}

import { Injectable } from "@nestjs/common";
import type {
  CalculationMethod as CalculationMethodType,
  PrayerTimes,
} from "adhan";
import type {
  Madhab,
  PrayerCalculationMethod,
  PrayerName,
} from "../contracts";

export const PRAYER_NAMES: PrayerName[] = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

export type PrayerCalculationInput = {
  latitude: number;
  longitude: number;
  madhab: Madhab;
  calculationMethod: PrayerCalculationMethod;
  timezone: string;
};

export type CalculatedPrayer = {
  name: PrayerName;
  time: string;
};

@Injectable()
export class PrayerTimeService {
  async calculate(
    localDate: string,
    input: PrayerCalculationInput,
  ): Promise<CalculatedPrayer[]> {
    const adhan = await loadAdhan();
    const date = parseLocalDate(localDate);
    const coordinates = new adhan.Coordinates(input.latitude, input.longitude);
    const parameters = calculationParameters(
      input.calculationMethod,
      adhan.CalculationMethod,
    );
    const hanafi = input.madhab === "hanafi";
    parameters.madhab = hanafi ? adhan.Madhab.Hanafi : adhan.Madhab.Shafi;
    parameters.shafaq = hanafi ? adhan.Shafaq.Abyad : adhan.Shafaq.Ahmer;
    parameters.highLatitudeRule = adhan.HighLatitudeRule.recommended(coordinates);
    parameters.polarCircleResolution = adhan.PolarCircleResolution.AqrabYaum;
    const times = new adhan.PrayerTimes(coordinates, date, parameters);

    return PRAYER_NAMES.map((name) => ({
      name,
      time: prayerDate(times, name).toISOString(),
    }));
  }

  async withNextPrayer(
    localDate: string,
    input: PrayerCalculationInput,
    now = new Date(),
  ) {
    const prayers = await this.calculate(localDate, input);
    const nextToday = prayers.find((prayer) => new Date(prayer.time) > now);
    if (nextToday) {
      return { prayers, nextPrayer: nextToday };
    }
    const nextDate = addLocalDays(localDate, 1);
    const nextFajr = (await this.calculate(nextDate, input))[0];
    return { prayers, nextPrayer: nextFajr ?? null };
  }
}

export function localDateInTimezone(
  date: Date,
  timezone: string,
) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${value.year}-${value.month}-${value.day}`;
}

export function addLocalDays(localDate: string, days: number) {
  const date = parseLocalDate(localDate);
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseLocalDate(localDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    throw new Error("Date must use YYYY-MM-DD.");
  }
  const [year, month, day] = localDate.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!, 12, 0, 0, 0);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month! - 1
    || date.getDate() !== day
  ) {
    throw new Error("Date is invalid.");
  }
  return date;
}

function calculationParameters(
  method: PrayerCalculationMethod,
  CalculationMethod: typeof CalculationMethodType,
) {
  switch (method) {
    case "muslim_world_league":
      return CalculationMethod.MuslimWorldLeague();
    case "egyptian":
      return CalculationMethod.Egyptian();
    case "umm_al_qura":
      return CalculationMethod.UmmAlQura();
    case "dubai":
      return CalculationMethod.Dubai();
    case "qatar":
      return CalculationMethod.Qatar();
    case "kuwait":
      return CalculationMethod.Kuwait();
    case "moonsighting_committee":
      return CalculationMethod.MoonsightingCommittee();
    case "singapore":
      return CalculationMethod.Singapore();
    case "turkey":
      return CalculationMethod.Turkey();
    case "tehran":
      return CalculationMethod.Tehran();
    case "north_america":
      return CalculationMethod.NorthAmerica();
    case "karachi":
    default:
      return CalculationMethod.Karachi();
  }
}

function prayerDate(times: PrayerTimes, name: PrayerName) {
  switch (name) {
    case "fajr":
      return times.fajr;
    case "dhuhr":
      return times.dhuhr;
    case "asr":
      return times.asr;
    case "maghrib":
      return times.maghrib;
    case "isha":
      return times.isha;
  }
}

type AdhanModule = typeof import("adhan");
let adhanPromise: Promise<AdhanModule> | null = null;

function loadAdhan() {
  adhanPromise ??= (
    new Function("specifier", "return import(specifier)") as
      (specifier: string) => Promise<AdhanModule>
  )("adhan");
  return adhanPromise;
}

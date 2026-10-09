import { z } from "zod";
import {
  FSINF_FINGERPRINT_DEFAULT_BANNER,
  FSINF_FINGERPRINT_DEFAULT_PURPOSE,
  type TSurveyFsinfFingerprint,
} from "@formbricks/types/surveys/types";

/**
 * FSINF: device fingerprint audit for link surveys — the parts shared by browser and server.
 *
 * FingerprintJS (open-source agent, MIT) collects ~40 entropy sources. Most of them describe the
 * *browser* (canvas/audio/math rendering, fonts as the engine measures them, plugins, user agent …) and
 * change when the same person switches from Chrome to Firefox. The device traits below are the sources
 * that describe the machine and its OS settings instead — screen, CPU cores, timezone, touch hardware,
 * OS-level display/accessibility preferences — so they stay the same across browsers on one device.
 *
 * Two ids come out of it (see token.ts): the DEVICE id over these traits (cross-browser, but coarse:
 * two identical laptops with the same settings collide) and the BROWSER id over FingerprintJS' full
 * visitorId (very distinctive, but per browser). Together they make a usable audit signal; neither is
 * proof — everything is computed on the client and can be spoofed.
 */

export const ZDeviceTraits = z
  .object({
    platform: z.string().max(64),
    /** "<long side>x<short side>", so rotating a phone does not make it a new device. */
    screen: z.string().max(32),
    colorDepth: z.number().int().min(0).max(64).nullable(),
    colorGamut: z.string().max(16).nullable(),
    hdr: z.boolean().nullable(),
    cores: z.number().int().min(0).max(4096).nullable(),
    timezone: z.string().max(64),
    maxTouchPoints: z.number().int().min(0).max(1024).nullable(),
    contrast: z.number().int().min(-100).max(100).nullable(),
    reducedMotion: z.boolean().nullable(),
    invertedColors: z.boolean().nullable(),
    forcedColors: z.boolean().nullable(),
    monochrome: z.number().int().min(0).max(1024).nullable(),
  })
  .strict();

export type TDeviceTraits = z.infer<typeof ZDeviceTraits>;

const DEVICE_TRAIT_KEYS = Object.keys(ZDeviceTraits.shape) as (keyof TDeviceTraits)[];

/** FingerprintJS' `components`: per source either `{ value, duration }` or `{ error, duration }`. */
type TComponents = Readonly<Record<string, unknown>>;

const valueOf = (components: TComponents, key: string): unknown => {
  const component = components[key];
  return component && typeof component === "object" && "value" in component ? component.value : undefined;
};

const str = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");

const optStr = (value: unknown, max: number): string | null =>
  typeof value === "string" ? value.slice(0, max) : null;

const int = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;

const bool = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

const screenOf = (value: unknown): string => {
  if (!Array.isArray(value)) return "";
  const [a, b] = value;
  if (typeof a !== "number" || typeof b !== "number") return "";
  return `${Math.max(a, b)}x${Math.min(a, b)}`;
};

/** Picks the device-level traits out of a FingerprintJS result, tolerating any missing source. */
export const extractDeviceTraits = (components: TComponents): TDeviceTraits => {
  const touch = valueOf(components, "touchSupport");
  return {
    platform: str(valueOf(components, "platform"), 64),
    screen: screenOf(valueOf(components, "screenResolution")),
    colorDepth: int(valueOf(components, "colorDepth"), 0, 64),
    colorGamut: optStr(valueOf(components, "colorGamut"), 16),
    hdr: bool(valueOf(components, "hdr")),
    cores: int(valueOf(components, "hardwareConcurrency"), 0, 4096),
    timezone: str(valueOf(components, "timezone"), 64),
    maxTouchPoints:
      touch && typeof touch === "object"
        ? int((touch as { maxTouchPoints?: unknown }).maxTouchPoints, 0, 1024)
        : null,
    contrast: int(valueOf(components, "contrast"), -100, 100),
    reducedMotion: bool(valueOf(components, "reducedMotion")),
    invertedColors: bool(valueOf(components, "invertedColors")),
    forcedColors: bool(valueOf(components, "forcedColors")),
    monochrome: int(valueOf(components, "monochrome"), 0, 1024),
  };
};

/** Stable serialization (fixed key order) — the input of the device id. */
export const canonicalDeviceTraits = (traits: TDeviceTraits): string =>
  JSON.stringify(DEVICE_TRAIT_KEYS.map((key) => [key, traits[key] ?? null]));

/** "Win32 · 1920×1080 · 8 Kerne · Europe/Berlin · kein Touch" — for the audit views. */
export const formatDeviceTraits = (traits: TDeviceTraits): string =>
  [
    traits.platform,
    traits.screen.replace("x", "×"),
    traits.cores === null ? "" : `${traits.cores} Kerne`,
    traits.timezone,
    traits.maxTouchPoints === null ? "" : traits.maxTouchPoints > 0 ? "Touch" : "kein Touch",
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Response-data keys the server writes from the signed fingerprint cookie. Reserved like the SSO keys:
 * whatever a client sends under them is dropped (gate.ts), so nobody can plant a fingerprint.
 */
export const FSINF_FP_RESPONSE_KEYS = {
  status: "fsinfFpStatus",
  device: "fsinfFpDevice",
  browser: "fsinfFpBrowser",
  info: "fsinfFpDeviceInfo",
} as const;

export const FSINF_FP_RESPONSE_KEY_LIST: readonly string[] = Object.values(FSINF_FP_RESPONSE_KEYS);

/** recorded = consented and captured; declined = answered without consent; missing = no consent step. */
export const FSINF_FP_STATUSES = ["recorded", "declined", "missing"] as const;
export type TFingerprintStatus = (typeof FSINF_FP_STATUSES)[number];

export const FSINF_FP_STATUS_LABELS: Record<TFingerprintStatus, string> = {
  recorded: "erfasst",
  declined: "abgelehnt",
  missing: "nicht erfasst",
};

export interface TRecordedFingerprint {
  status: TFingerprintStatus;
  device: string;
  browser: string;
  info: string;
}

const dataString = (data: Record<string, unknown>, key: string): string =>
  typeof data[key] === "string" ? (data[key] as string) : "";

/** The fingerprint audit entry of a response, or null for surveys without fingerprinting. */
export const getRecordedFingerprint = (data: Record<string, unknown>): TRecordedFingerprint | null => {
  const status = dataString(data, FSINF_FP_RESPONSE_KEYS.status);
  if (!(FSINF_FP_STATUSES as readonly string[]).includes(status)) return null;
  return {
    status: status as TFingerprintStatus,
    device: dataString(data, FSINF_FP_RESPONSE_KEYS.device),
    browser: dataString(data, FSINF_FP_RESPONSE_KEYS.browser),
    info: dataString(data, FSINF_FP_RESPONSE_KEYS.info),
  };
};

/** How many of the given responses came from each device id — the core of the audit. */
export const countSameDevice = (responsesData: readonly Record<string, unknown>[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const data of responsesData) {
    const device = dataString(data, FSINF_FP_RESPONSE_KEYS.device);
    if (device) counts.set(device, (counts.get(device) ?? 0) + 1);
  }
  return counts;
};

/** Export columns (CSV/XLSX), in this order. */
export const FSINF_FP_EXPORT_COLUMNS = [
  { header: "Fingerprint Status", key: FSINF_FP_RESPONSE_KEYS.status },
  { header: "Device ID", key: FSINF_FP_RESPONSE_KEYS.device },
  { header: "Browser ID", key: FSINF_FP_RESPONSE_KEYS.browser },
  { header: "Device", key: FSINF_FP_RESPONSE_KEYS.info },
] as const;

export const FSINF_FP_EXPORT_HEADERS: string[] = FSINF_FP_EXPORT_COLUMNS.map((column) => column.header);

/** The reason shown to respondents: the survey's own, or the generic default. */
export const fingerprintPurposeFor = (
  config: Partial<NonNullable<TSurveyFsinfFingerprint>> | null | undefined
): string => config?.purpose?.trim() || FSINF_FINGERPRINT_DEFAULT_PURPOSE;

/** The always-visible popup text: the survey's own, or the generic default. */
export const fingerprintBannerFor = (
  config: Partial<NonNullable<TSurveyFsinfFingerprint>> | null | undefined
): string => config?.bannerText?.trim() || FSINF_FINGERPRINT_DEFAULT_BANNER;

/**
 * Whether the survey page shows the consent popup. Only an accepted decision is remembered across page
 * loads; a declined one is asked again on the next load (the "declined" cookie still marks a response
 * submitted right after declining).
 */
export const needsFingerprintConsent = (
  config: Partial<NonNullable<TSurveyFsinfFingerprint>> | null | undefined,
  decision: { status: string } | null
): boolean => Boolean(config?.enabled) && decision?.status !== "recorded";

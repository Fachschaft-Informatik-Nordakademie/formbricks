"use client";

import { ShieldCheckIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { extractDeviceTraits } from "@/modules/survey/link/lib/fsinf-device-fingerprint/traits";
import { Button } from "@/modules/ui/components/button";

/**
 * FSINF: consent step of the device fingerprint audit, shown instead of the survey until the respondent
 * decided. Layered notice: the first layer is a generic banner text that still
 * names what (device information), why (duplicate votes) and that it is optional; the survey's purpose
 * and the technical details sit in the expandable section. Do not strip the first layer further — it must
 * stay enough for an informed choice, otherwise the consent is not valid. Reading device properties needs consent (§ 25 Abs. 1 TDDDG) even though it is only logged,
 * so nothing is read before "Einverstanden" — FingerprintJS is not even loaded until then. Declining is
 * an equal option and still leads to the survey; the response is then marked "abgelehnt".
 *
 * The decision is posted to the public domain the survey client sends its responses to: the cookie it
 * sets must be visible to those requests (same origin), so a page opened on the second domain first
 * moves over there.
 */

const FINGERPRINT_API_PATH = "/api/fsinf/device-fingerprint";

interface FsinfFingerprintConsentScreenProps {
  surveyId: string;
  surveyName: string;
  purpose: string;
  publicDomain: string;
  privacyUrl?: string;
  imprintUrl?: string;
}

const collectFingerprint = async () => {
  // Loaded only after consent. monitoring: false — otherwise the agent pings Fingerprint Inc.'s CDN.
  const FingerprintJS = await import("@fingerprintjs/fingerprintjs");
  const agent = await FingerprintJS.load({ monitoring: false });
  const result = await agent.get();
  return { visitorId: result.visitorId, traits: extractDeviceTraits(result.components) };
};

export const FsinfFingerprintConsentScreen = ({
  surveyId,
  surveyName,
  purpose,
  publicDomain,
  privacyUrl,
  imprintUrl,
}: Readonly<FsinfFingerprintConsentScreenProps>) => {
  const router = useRouter();
  const [busy, setBusy] = useState<"consent" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const target = new URL(publicDomain);
    if (window.location.origin !== target.origin) {
      window.location.replace(`${target.origin}${window.location.pathname}${window.location.search}`);
    }
  }, [publicDomain]);

  const decide = async (consent: boolean) => {
    setBusy(consent ? "consent" : "decline");
    setError(null);
    try {
      const body = consent ? { surveyId, consent, ...(await collectFingerprint()) } : { surveyId, consent };
      const response = await fetch(FINGERPRINT_API_PATH, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      router.refresh();
    } catch {
      setError(
        consent
          ? "Die Gerätemerkmale konnten nicht erfasst werden. Versuche es noch einmal oder nimm ohne Speicherung teil."
          : "Deine Entscheidung konnte nicht gespeichert werden. Bitte versuche es noch einmal."
      );
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-between bg-linear-to-br from-slate-200 to-slate-50 px-4 py-8">
      <div className="my-auto flex w-full max-w-lg flex-col gap-y-4">
        <div className="flex flex-col items-center gap-y-3 text-center">
          <ShieldCheckIcon className="size-16 text-slate-400" />
          <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">{surveyName}</p>
          <h1 className="text-3xl font-bold text-slate-800">Bevor es losgeht</h1>
        </div>

        {/* First layer: generic like any consent banner, but still says what (device information), why
            (duplicate votes) and that it is optional. Purpose and technical details: one click away. */}
        <p className="text-base leading-7 text-slate-600">
          Zum Schutz vor Mehrfachabstimmungen speichern wir mit deiner Antwort technische Informationen über
          dein Gerät. Das ist freiwillig — du kannst auch ohne teilnehmen.
        </p>

        <details className="group rounded-lg border border-slate-200 bg-white/60 px-4 py-2 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium text-slate-700">Details und Datenschutz</summary>
          <p className="mt-2 font-semibold text-slate-700">Warum diese Umfrage das braucht</p>
          <p className="whitespace-pre-line">{purpose}</p>
          <ul className="mt-2 list-disc space-y-1 pb-1 pl-5 leading-6">
            <li>
              <span className="font-semibold">Verfahren:</span> Geräte-Fingerabdruck mit FingerprintJS. Das
              Skript wird erst nach deiner Zustimmung geladen und läuft auf diesem Server, ohne Verbindung zum
              Hersteller.
            </li>
            <li>
              <span className="font-semibold">Was gelesen wird:</span> Eigenschaften deines Geräts und
              Browsers, z. B. Bildschirmgröße, Prozessorkerne, Zeitzone, Betriebssystem, Grafik- und
              Audio-Darstellung.
            </li>
            <li>
              <span className="font-semibold">Was gespeichert wird:</span> nur daraus berechnete, nicht
              umkehrbare Kennungen (je Umfrage verschieden) und eine Kurzbeschreibung des Geräts wie „Win32 ·
              1920×1080 · 8 Kerne“, zusammen mit deiner Antwort und so lange wie sie.
            </li>
            <li>
              <span className="font-semibold">Wer es sieht:</span> nur die Ersteller:innen der Umfrage. Es
              werden keine Daten an Dritte gesendet. Niemand wird dadurch von der Teilnahme ausgeschlossen.
            </li>
            <li>
              <span className="font-semibold">Freiwillig:</span> Ohne Zustimmung wird deine Antwort als
              „abgelehnt“ markiert. Rechtsgrundlage ist deine Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1
              lit. a DSGVO). Du kannst sie jederzeit mit Wirkung für die Zukunft bei den Ersteller:innen der
              Umfrage widerrufen.
            </li>
          </ul>
        </details>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Both choices equally prominent — consent must not be nudged. */}
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            variant="secondary"
            loading={busy === "consent"}
            disabled={busy !== null}
            onClick={() => decide(true)}>
            Einverstanden
          </Button>
          <Button
            variant="secondary"
            loading={busy === "decline"}
            disabled={busy !== null}
            onClick={() => decide(false)}>
            Ohne Speicherung teilnehmen
          </Button>
        </div>
      </div>

      {(imprintUrl || privacyUrl) && (
        <div className="mt-6 flex gap-x-4 text-xs text-slate-500">
          {imprintUrl && (
            <Link href={imprintUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Impressum
            </Link>
          )}
          {privacyUrl && (
            <Link href={privacyUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Datenschutz
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { extractDeviceTraits } from "@/modules/survey/link/lib/fsinf-device-fingerprint/traits";
import { Button } from "@/modules/ui/components/button";

/**
 * FSINF: consent step of the device fingerprint audit, shown instead of the survey until the respondent
 * decided. Layered notice styled like an ordinary website consent popup: the first layer
 * is generic ("Cookies und ähnliche Technologien … vor Missbrauch schützen", Akzeptieren / Ablehnen) but
 * still names technology, purpose and the choice; the survey's purpose and the technical details sit in
 * the expandable "Details". Do not strip the first layer further — it must
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
          ? "Das hat nicht geklappt. Versuche es noch einmal oder lehne ab, um ohne teilzunehmen."
          : "Deine Auswahl konnte nicht gespeichert werden. Bitte versuche es noch einmal."
      );
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-center bg-linear-to-br from-slate-200 to-slate-50 px-4 py-8">
      <p className="mb-3 text-sm text-slate-500">{surveyName}</p>

      {/* Looks like an ordinary website consent popup. The first layer is as generic as such banners are,
          but still names technology, purpose and the choice — less would make the consent invalid. */}
      <div
        role="dialog"
        aria-labelledby="fsinf-consent-title"
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-lg">
        <h1 id="fsinf-consent-title" className="text-lg font-semibold text-slate-800">
          Hinweis zum Datenschutz
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Wir verwenden Cookies und ähnliche Technologien, um diese Umfrage vor Missbrauch zu schützen.
        </p>

        <details className="mt-3 text-sm text-slate-600">
          <summary className="cursor-pointer text-slate-500 underline-offset-2 hover:underline">
            Details
          </summary>
          <div className="mt-2 space-y-2 leading-6">
            <p>
              <span className="font-semibold text-slate-700">Zweck:</span> {purpose}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Verfahren:</span> Geräte-Fingerabdruck mit
              FingerprintJS. Das Skript wird erst nach deiner Zustimmung geladen und läuft auf diesem Server,
              ohne Verbindung zum Hersteller. Ein Cookie merkt sich deine Entscheidung für 24 Stunden.
            </p>
            <p>
              <span className="font-semibold text-slate-700">Was gelesen wird:</span> Eigenschaften deines
              Geräts und Browsers, z. B. Bildschirmgröße, Prozessorkerne, Zeitzone, Betriebssystem, Grafik-
              und Audio-Darstellung.
            </p>
            <p>
              <span className="font-semibold text-slate-700">Was gespeichert wird:</span> nur daraus
              berechnete, nicht umkehrbare Kennungen (je Umfrage verschieden) und eine Kurzbeschreibung des
              Geräts wie „Win32 · 1920×1080 · 8 Kerne“, zusammen mit deiner Antwort und so lange wie sie.
            </p>
            <p>
              <span className="font-semibold text-slate-700">Wer es sieht:</span> nur die Ersteller:innen der
              Umfrage. Es werden keine Daten an Dritte gesendet. Niemand wird dadurch von der Teilnahme
              ausgeschlossen.
            </p>
            <p>
              <span className="font-semibold text-slate-700">Freiwillig:</span> Du kannst auch teilnehmen,
              wenn du ablehnst; deine Antwort wird dann als „abgelehnt“ markiert. Rechtsgrundlage ist deine
              Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO). Du kannst sie jederzeit mit
              Wirkung für die Zukunft bei den Ersteller:innen der Umfrage widerrufen.
            </p>
          </div>
        </details>

        {error && (
          <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {/* Both choices equally prominent — consent must not be nudged. */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            loading={busy === "consent"}
            disabled={busy !== null}
            onClick={() => decide(true)}>
            Akzeptieren
          </Button>
          <Button
            variant="secondary"
            loading={busy === "decline"}
            disabled={busy !== null}
            onClick={() => decide(false)}>
            Ablehnen
          </Button>
        </div>

        {(imprintUrl || privacyUrl) && (
          <div className="mt-4 flex justify-center gap-x-4 text-xs text-slate-500">
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
    </div>
  );
};

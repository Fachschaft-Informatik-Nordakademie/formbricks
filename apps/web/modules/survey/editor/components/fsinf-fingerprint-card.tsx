"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { FingerprintIcon } from "lucide-react";
import { useState } from "react";
import { TSurvey } from "@formbricks/types/surveys/types";
import { cn } from "@/lib/cn";
import { AdvancedOptionToggle } from "@/modules/ui/components/advanced-option-toggle";
import { Alert, AlertDescription, AlertTitle } from "@/modules/ui/components/alert";
import { Label } from "@/modules/ui/components/label";
import { Textarea } from "@/modules/ui/components/textarea";
import {
  type TFsinfFingerprintConfig,
  setFingerprintEnabled,
  withFingerprintDefaults,
} from "./fsinf-fingerprint-card-utils";

/**
 * FSINF: survey editor card for the device fingerprint audit. German like the other FSINF UI.
 * Logic lives in modules/survey/link/lib/fsinf-device-fingerprint.
 */

interface FsinfFingerprintCardProps {
  localSurvey: TSurvey;
  setLocalSurvey: (survey: TSurvey | ((prev: TSurvey) => TSurvey)) => void;
}

export const FsinfFingerprintCard = ({
  localSurvey,
  setLocalSurvey,
}: Readonly<FsinfFingerprintCardProps>) => {
  const config = withFingerprintDefaults(localSurvey.fsinfFingerprint);
  const [open, setOpen] = useState(config.enabled);

  if (localSurvey.type !== "link") return null;

  const update = (change: (current: TFsinfFingerprintConfig) => TFsinfFingerprintConfig) =>
    setLocalSurvey((prev) => ({
      ...prev,
      fsinfFingerprint: change(withFingerprintDefaults(prev.fsinfFingerprint)),
    }));

  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className={cn(
        open ? "" : "hover:bg-slate-50",
        "w-full space-y-2 rounded-lg border border-slate-300 bg-white"
      )}>
      <Collapsible.CollapsibleTrigger asChild className="h-full w-full cursor-pointer">
        <div className="inline-flex px-4 py-4">
          <div className="flex items-center pr-5 pl-2">
            <FingerprintIcon
              strokeWidth={2.5}
              className={cn(
                "size-7 rounded-full border p-1.5",
                config.enabled
                  ? "border-amber-300 bg-amber-100 text-amber-600"
                  : "border-slate-300 bg-slate-100 text-slate-500"
              )}
            />
          </div>
          <div>
            <p className="font-semibold text-slate-800">
              Geräte-Fingerabdruck (Audit)
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                nur wenn unbedingt erforderlich
              </span>
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Speichert pro Antwort einen Geräte-Fingerabdruck, um später Mehrfachabstimmungen prüfen zu
              können. Blockiert niemanden.
            </p>
          </div>
        </div>
      </Collapsible.CollapsibleTrigger>
      <Collapsible.CollapsibleContent className="flex flex-col overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <hr className="py-1 text-slate-600" />
        <div className="space-y-3 p-3">
          <Alert variant="warning" size="small">
            <AlertTitle>Nur wenn unbedingt erforderlich</AlertTitle>
            <AlertDescription>
              <p>
                Nur für Umfragen, bei denen Mehrfachabstimmungen echten Schaden anrichten, z. B. wichtige
                Abstimmungen der Fachschaft. Nicht für Feedback, Evaluationen oder anonyme Umfragen.
              </p>
              <p className="mt-1">
                Wer abstimmen darf, ist mit „Zugang per NAK-Studis-Login“ + „Eine Antwort pro Account“
                zuverlässiger und datensparsamer geregelt. Der Fingerabdruck ist nur ein Indiz: Er lässt sich
                fälschen, und gleiche Geräte (z. B. zwei gleiche Laptops) können dieselbe Geräte-ID haben.
              </p>
              <p className="mt-1">
                Rechtlich ist das ein Zugriff auf das Endgerät (§ 25 TDDDG): Befragte werden vor der Umfrage
                um Einwilligung gebeten und können auch nach Ablehnen teilnehmen. Sie sehen einen allgemeinen
                Datenschutz-Hinweis wie auf jeder Website (Text unten, Akzeptieren / Ablehnen); Zweck und
                technische Details stehen aufklappbar unter „Details“.
              </p>
            </AlertDescription>
          </Alert>

          <AdvancedOptionToggle
            htmlId="fsinfFingerprintEnabled"
            isChecked={config.enabled}
            onToggle={(enabled) => update((current) => setFingerprintEnabled(current, enabled))}
            title="Geräte-Fingerabdruck mit jeder Antwort speichern"
            description="Vor der Umfrage erscheint eine Einwilligungsabfrage. In der Antwortübersicht und im Export stehen dann Geräte-ID, Browser-ID und eine Kurzbeschreibung des Geräts."
            childBorder={true}>
            <div className="w-full space-y-2 p-4">
              <Label htmlFor="fsinfFingerprintBanner">
                Text im Datenschutz-Hinweis (für Teilnehmende sichtbar)
              </Label>
              <Textarea
                id="fsinfFingerprintBanner"
                className="bg-white"
                value={config.bannerText}
                maxLength={300}
                onChange={(event) => update((current) => ({ ...current, bannerText: event.target.value }))}
              />
              <p className="text-xs text-slate-500">
                Vorausgefüllt mit dem Standardtext — anpassen oder so lassen (leer = Standardtext). Der Text
                muss weiterhin nennen, <em>was</em> verwendet wird (z. B. „Cookies und ähnliche Technologien“)
                und <em>wozu</em> — sonst ist die Einwilligung unwirksam.
              </p>
            </div>
          </AdvancedOptionToggle>
        </div>
      </Collapsible.CollapsibleContent>
    </Collapsible.Root>
  );
};

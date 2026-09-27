import { LockKeyholeIcon, ShieldAlertIcon } from "lucide-react";
import Link from "next/link";
import { IMPRINT_URL, PRIVACY_URL } from "@/lib/constants";
import { Button } from "@/modules/ui/components/button";

/**
 * FSINF: what a respondent sees on an SSO-protected link survey before they may answer — either the
 * "sign in with your NAK-Studis account" prompt or, after signing in, "this account may not answer".
 *
 * German on purpose, like the other FSINF screens: every respondent of this instance is at the
 * NORDAKADEMIE. It also states up front whether the answer is stored with the respondent's name
 * (recordIdentity) or only pseudonymously — the respondent has to know that before signing in (Art. 13
 * DSGVO), not find out afterwards.
 */

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Die Anmeldung wurde abgebrochen.",
  failed: "Die Anmeldung konnte nicht abgeschlossen werden. Bitte versuche es noch einmal.",
  state: "Der Anmeldeversuch ist abgelaufen. Bitte versuche es noch einmal.",
  unavailable: "Der Login-Dienst ist gerade nicht erreichbar. Bitte versuche es später noch einmal.",
};

interface FsinfRespondentSsoScreenProps {
  mode: "login" | "denied" | "unconfigured";
  surveyName: string;
  loginUrl: string;
  switchAccountUrl: string;
  recordIdentity: boolean;
  oneResponsePerUser: boolean;
  signedInAs?: string;
  error?: string;
}

export const FsinfRespondentSsoScreen = ({
  mode,
  surveyName,
  loginUrl,
  switchAccountUrl,
  recordIdentity,
  oneResponsePerUser,
  signedInAs,
  error,
}: Readonly<FsinfRespondentSsoScreenProps>) => {
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.failed) : undefined;

  return (
    <div className="flex h-full min-h-screen flex-col items-center justify-between bg-linear-to-br from-slate-200 to-slate-50 px-4 py-8 text-center">
      <div className="my-auto flex w-full max-w-md flex-col items-center gap-y-4">
        <div className="text-slate-400">
          {mode === "denied" ? (
            <ShieldAlertIcon className="size-16" />
          ) : (
            <LockKeyholeIcon className="size-16" />
          )}
        </div>
        <p className="text-sm font-medium tracking-wide text-slate-500 uppercase">{surveyName}</p>

        {mode === "login" && (
          <>
            <h1 className="text-3xl font-bold text-slate-800">Anmeldung erforderlich</h1>
            <p className="text-base leading-7 text-slate-600">
              Diese Umfrage können nur Personen mit einem NAK-Studis-Account beantworten. Melde dich an, um
              fortzufahren.
            </p>
            {errorMessage && (
              <p role="alert" className="w-full rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
                {errorMessage}
              </p>
            )}
            <Button className="mt-2" asChild>
              <Link href={loginUrl}>Mit NAK-Studis-Account anmelden</Link>
            </Button>
          </>
        )}

        {mode === "denied" && (
          <>
            <h1 className="text-3xl font-bold text-slate-800">Kein Zugriff</h1>
            <p className="text-base leading-7 text-slate-600">
              Du bist als <span className="font-semibold">{signedInAs}</span> angemeldet. Dieses Konto ist für
              diese Umfrage nicht freigeschaltet.
            </p>
            <Button className="mt-2" variant="secondary" asChild>
              <Link href={switchAccountUrl}>Mit anderem Konto anmelden</Link>
            </Button>
          </>
        )}

        {mode === "unconfigured" && (
          <>
            <h1 className="text-3xl font-bold text-slate-800">Umfrage derzeit nicht verfügbar</h1>
            <p className="text-base leading-7 text-slate-600">
              Diese Umfrage verlangt eine Anmeldung, der Login ist auf diesem Server aber nicht eingerichtet.
              Bitte wende dich an die Ersteller:innen der Umfrage.
            </p>
          </>
        )}

        {mode !== "unconfigured" && (
          <p className="text-xs leading-5 text-slate-500">
            {recordIdentity
              ? "Hinweis: Deine Antwort wird zusammen mit deinem Namen, Benutzernamen und deiner E-Mail-Adresse gespeichert und ist für die Ersteller:innen der Umfrage sichtbar."
              : "Hinweis: Die Anmeldung dient nur der Zugangsprüfung. Name und E-Mail-Adresse werden nicht mit deiner Antwort gespeichert."}
            {oneResponsePerUser && " Pro Account ist eine Antwort möglich."}
          </p>
        )}
      </div>

      {(IMPRINT_URL || PRIVACY_URL) && (
        <div className="flex gap-x-4 text-xs text-slate-500">
          {IMPRINT_URL && (
            <Link href={IMPRINT_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Impressum
            </Link>
          )}
          {PRIVACY_URL && (
            <Link href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Datenschutz
            </Link>
          )}
        </div>
      )}
    </div>
  );
};

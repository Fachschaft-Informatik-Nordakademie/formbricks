"use client";

import * as Collapsible from "@radix-ui/react-collapsible";
import { KeyRoundIcon } from "lucide-react";
import { useState } from "react";
import { TSurvey } from "@formbricks/types/surveys/types";
import { cn } from "@/lib/cn";
import { AdvancedOptionToggle } from "@/modules/ui/components/advanced-option-toggle";
import { Alert, AlertDescription } from "@/modules/ui/components/alert";
import { Label } from "@/modules/ui/components/label";
import { MultiSelect } from "@/modules/ui/components/multi-select";
import { Textarea } from "@/modules/ui/components/textarea";
import {
  type TFsinfSsoConfig,
  formatHandleList,
  parseHandleList,
  withFsinfSsoDefaults,
} from "./fsinf-sso-card-utils";

/**
 * FSINF: survey editor card for "respondents must sign in with their NAK-Studis (Authentik) account".
 * German like the other FSINF UI. Enforcement lives in modules/survey/link/lib/fsinf-respondent-sso.
 */

export interface TFsinfSsoEditorContext {
  /** False when the respondent OIDC client is not configured on this server. */
  isAvailable: boolean;
  /** All Authentik group names, or null when Authentik could not be asked (free-text fallback). */
  groups: string[] | null;
}

interface FsinfSsoCardProps {
  localSurvey: TSurvey;
  setLocalSurvey: (survey: TSurvey | ((prev: TSurvey) => TSurvey)) => void;
  context: TFsinfSsoEditorContext;
}

export const FsinfSsoCard = ({ localSurvey, setLocalSurvey, context }: Readonly<FsinfSsoCardProps>) => {
  const config = withFsinfSsoDefaults(localSurvey.fsinfSso);
  const [open, setOpen] = useState(config.enabled);
  const [usersText, setUsersText] = useState(formatHandleList(config.allowedUsers));
  const [groupsText, setGroupsText] = useState(formatHandleList(config.allowedGroups));

  if (localSurvey.type !== "link") return null;

  const update = (patch: Partial<TFsinfSsoConfig>) =>
    setLocalSurvey((prev) => ({ ...prev, fsinfSso: { ...withFsinfSsoDefaults(prev.fsinfSso), ...patch } }));

  // Keep configured groups selectable even if Authentik no longer lists them (renamed/deleted group),
  // so they can still be seen and removed.
  const groupOptions = [...new Set([...(context.groups ?? []), ...config.allowedGroups])]
    .sort((a, b) => a.localeCompare(b, "de"))
    .map((name) => ({ value: name, label: name }));

  const isOpenToEveryone = config.allowedGroups.length === 0 && config.allowedUsers.length === 0;

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
            <KeyRoundIcon
              strokeWidth={2.5}
              className={cn(
                "size-7 rounded-full border p-1.5",
                config.enabled
                  ? "border-green-300 bg-green-100 text-green-600"
                  : "border-slate-300 bg-slate-100 text-slate-500"
              )}
            />
          </div>
          <div>
            <p className="font-semibold text-slate-800">Zugang per NAK-Studis-Login</p>
            <p className="mt-1 text-sm text-slate-500">
              Nur angemeldete Personen, Gruppen oder einzelne Accounts dürfen antworten.
            </p>
          </div>
        </div>
      </Collapsible.CollapsibleTrigger>
      <Collapsible.CollapsibleContent className="flex flex-col overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <hr className="py-1 text-slate-600" />
        <div className="space-y-3 p-3">
          {!context.isAvailable && (
            <Alert variant="warning" size="small">
              <AlertDescription>
                Der Befragten-Login ist auf diesem Server nicht eingerichtet (FSINF_RESPONDENT_OIDC_*). Eine
                Umfrage mit aktivierter Anmeldung ist dann für niemanden beantwortbar.
              </AlertDescription>
            </Alert>
          )}

          <AdvancedOptionToggle
            htmlId="fsinfSsoEnabled"
            isChecked={config.enabled}
            onToggle={(enabled) => update({ enabled })}
            title="Anmeldung mit NAK-Studis-Account verlangen"
            description="Befragte müssen sich über portal.nak-studis.de anmelden, bevor sie die Umfrage sehen. Die Prüfung erfolgt auch serverseitig beim Absenden."
            childBorder={true}>
            <div className="w-full space-y-5 p-4">
              <div className="space-y-2">
                <Label htmlFor="fsinfSsoGroups">Erlaubte Gruppen</Label>
                {context.groups ? (
                  <MultiSelect
                    options={groupOptions}
                    value={config.allowedGroups}
                    onChange={(allowedGroups) => update({ allowedGroups: [...allowedGroups] })}
                    placeholder="Gruppen aus Authentik wählen …"
                  />
                ) : (
                  <>
                    <Textarea
                      id="fsinfSsoGroups"
                      className="bg-white"
                      value={groupsText}
                      placeholder={"Studierende\nFachschaft Informatik"}
                      onChange={(event) => {
                        setGroupsText(event.target.value);
                        update({ allowedGroups: parseHandleList(event.target.value) });
                      }}
                    />
                    <p className="text-xs text-slate-500">
                      Authentik ist gerade nicht erreichbar — Gruppennamen bitte exakt eintippen, einer pro
                      Zeile.
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="fsinfSsoUsers">Einzelne erlaubte Accounts</Label>
                <Textarea
                  id="fsinfSsoUsers"
                  className="bg-white"
                  value={usersText}
                  placeholder={"max.mustermann\nerika.musterfrau@nak-studis.de"}
                  onChange={(event) => {
                    setUsersText(event.target.value);
                    update({ allowedUsers: parseHandleList(event.target.value) });
                  }}
                />
                <p className="text-xs text-slate-500">
                  Benutzername oder E-Mail-Adresse, einer pro Zeile. Gruppen und Accounts gelten zusammen: wer
                  in einer der Gruppen ist <em>oder</em> hier steht, darf antworten.
                </p>
              </div>

              <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {isOpenToEveryone
                  ? "Keine Einschränkung gesetzt: Jede Person mit NAK-Studis-Account darf antworten."
                  : `Zugelassen: ${[
                      config.allowedGroups.length ? `${config.allowedGroups.length} Gruppe(n)` : "",
                      config.allowedUsers.length ? `${config.allowedUsers.length} Account(s)` : "",
                    ]
                      .filter(Boolean)
                      .join(" und ")}.`}
              </p>

              <AdvancedOptionToggle
                htmlId="fsinfSsoOneResponse"
                isChecked={config.oneResponsePerUser}
                onToggle={(oneResponsePerUser) => update({ oneResponsePerUser })}
                title="Eine Antwort pro Account"
                description={
                  localSurvey.singleUse?.enabled
                    ? "Wirkungslos, solange Einmal-Links aktiv sind — dann bestimmt der Link, wie oft geantwortet werden kann."
                    : "Wer schon geantwortet hat, sieht beim erneuten Öffnen „bereits beantwortet“. Angefangene Antworten werden fortgesetzt."
                }
              />

              <AdvancedOptionToggle
                htmlId="fsinfSsoRecordIdentity"
                isChecked={config.recordIdentity}
                onToggle={(recordIdentity) => update({ recordIdentity })}
                title="Name und E-Mail mit der Antwort speichern"
                description="Aus: Die Anmeldung dient nur der Zugangsprüfung, Antworten bleiben pseudonym. An: Name, Benutzername und E-Mail stehen bei jeder Antwort und im Export. Befragte werden vor dem Login darauf hingewiesen — nur aktivieren, wenn ihr die Identität wirklich braucht (DSGVO: Datenminimierung)."
              />
            </div>
          </AdvancedOptionToggle>
        </div>
      </Collapsible.CollapsibleContent>
    </Collapsible.Root>
  );
};

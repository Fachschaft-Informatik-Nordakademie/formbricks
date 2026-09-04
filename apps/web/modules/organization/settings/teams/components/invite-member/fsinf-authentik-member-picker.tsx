"use client";

import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { TAuthentikDirectoryMember } from "@/modules/auth/lib/fsinf-authentik-directory";
import { searchAuthentikMembersAction } from "@/modules/organization/settings/teams/fsinf-directory-actions";
import { Button } from "@/modules/ui/components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/modules/ui/components/command";

interface FsinfAuthentikMemberPickerProps {
  organizationId: string;
  /** Individual tab: fills name + email. Bulk tab: toggles the member in its selection. */
  onSelect: (member: TAuthentikDirectoryMember) => void;
  /** Bulk tab only: emails already picked, marked with a check and left selectable to un-pick. */
  selectedEmails?: string[];
  /** Bulk tab only: keep the list open so several people can be picked in one go. */
  keepOpenOnSelect?: boolean;
  label?: string;
}

const SEARCH_DEBOUNCE_MS = 250;

/**
 * FSINF: pick people to invite from Authentik (portal.nak-studis.de) instead of typing addresses from
 * memory. Used by both invite tabs — the individual one takes a single person, the bulk one collects
 * several as an alternative to uploading a CSV.
 *
 * Filtering happens server-side (`searchAuthentikMembersAction` → Authentik's `search` parameter), so
 * cmdk's own filtering is switched off — it must not filter the list it is handed a second time.
 *
 * The list is deliberately INLINE rather than in a Popover: this control lives inside the invite
 * Dialog, and a Popover renders into a portal outside the dialog's DOM. Radix's scroll lock then
 * treats the list as "outside" and swallows its wheel events, so the list could only be scrolled by
 * keyboard — it looked stuck. Inline content is inside the dialog's own scroll shard and scrolls
 * normally.
 *
 * The picker is an accelerator, never a gate: the fields it fills stay editable, the CSV upload stays
 * exactly as it was, and the whole control removes itself when the instance has no Authentik API
 * credentials.
 */
export const FsinfAuthentikMemberPicker = ({
  organizationId,
  onSelect,
  selectedEmails = [],
  keepOpenOnSelect = false,
  label = "Mitglied aus Authentik wählen",
}: Readonly<FsinfAuthentikMemberPickerProps>) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<TAuthentikDirectoryMember[]>([]);
  const [isConfigured, setIsConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  // Guards against a slow response for an older keystroke overwriting a newer one's results.
  const requestIdRef = useRef(0);

  const selected = new Set(selectedEmails.map((email) => email.toLowerCase()));

  const runSearch = useCallback(
    async (searchTerm: string) => {
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      const result = await searchAuthentikMembersAction({ organizationId, query: searchTerm });
      if (requestId !== requestIdRef.current) return; // a newer search already answered
      // A failed action (not authorized, network) leaves `data` undefined — treat it like an empty
      // directory rather than hiding the control mid-typing.
      setMembers(result?.data?.members ?? []);
      setIsConfigured(result?.data?.configured ?? false);
      setIsLoading(false);
    },
    [organizationId]
  );

  // One lookup on mount decides whether this control belongs on the page at all; every later one is
  // debounced against typing.
  useEffect(() => {
    if (!query) {
      void runSearch("");
      return;
    }
    const timeout = setTimeout(() => void runSearch(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, runSearch]);

  if (!isConfigured) return null;

  const handleSelect = (member: TAuthentikDirectoryMember) => {
    onSelect(member);
    if (keepOpenOnSelect) return;
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        className="w-full justify-between font-normal"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}>
        <span className="flex items-center gap-2 text-slate-600">
          <SearchIcon className="h-4 w-4" />
          {label}
        </span>
        <ChevronDownIcon className={cn("h-4 w-4 text-slate-500 transition-transform", open && "rotate-180")} />
      </Button>

      {open && (
        <Command shouldFilter={false} className="rounded-md border border-slate-300">
          <CommandInput placeholder="Name oder E-Mail …" value={query} onValueChange={setQuery} />
          <CommandList className="max-h-60 overscroll-contain border-0">
            <CommandEmpty>{isLoading ? "Suche in Authentik …" : "Keine Treffer in Authentik"}</CommandEmpty>
            <CommandGroup>
              {members.map((member) => {
                const isSelected = selected.has(member.email.toLowerCase());
                return (
                  <CommandItem
                    key={member.id}
                    value={member.id}
                    onSelect={() => handleSelect(member)}
                    className="flex flex-row items-center justify-between gap-2">
                    <span className="flex flex-col items-start gap-0.5">
                      <span className="text-sm font-medium text-slate-900">{member.name}</span>
                      <span className="text-xs text-slate-500">{member.email}</span>
                    </span>
                    <CheckIcon
                      className={cn(
                        "h-4 w-4 shrink-0 text-slate-900",
                        isSelected ? "opacity-100" : "opacity-0"
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      )}
    </div>
  );
};

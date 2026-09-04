import "server-only";
import { logger } from "@formbricks/logger";
import {
  AUTHENTIK_API_TOKEN,
  AUTHENTIK_DIRECTORY_GROUP,
  AUTHENTIK_URL,
} from "@/lib/constants";

/**
 * FSINF: read-only lookup of Fachschaft members in Authentik (portal.nak-studis.de), so the invite
 * dialog can offer the people who actually have an account instead of asking for a typed address.
 *
 * Scope is deliberately narrow: one GET against Authentik's user list, filtered server-side by the
 * caller's search term, returning only what the picker renders (name + email). No user-controlled URL
 * ever reaches fetch — base URL and token come from env, the search term goes through URLSearchParams
 * — so there is no SSRF surface here. The caller (the invite action) is what enforces that only an
 * owner/manager of the organization may run a lookup.
 */

export interface TAuthentikDirectoryMember {
  /** Authentik's `pk`, used only as a stable React key. */
  id: string;
  name: string;
  email: string;
  username: string;
}

/** Authentik pages its list endpoints; the picker only ever shows a short, filtered list. */
const RESULT_LIMIT = 25;

/** Feature is inert (picker hidden, action returns []) until both env vars are set. */
export const isAuthentikDirectoryConfigured = (): boolean => Boolean(AUTHENTIK_URL && AUTHENTIK_API_TOKEN);

interface AuthentikUser {
  pk?: number | string;
  username?: string;
  name?: string;
  email?: string;
  is_active?: boolean;
}

/**
 * Search Authentik's user directory. Returns [] rather than throwing when Authentik is unreachable or
 * unconfigured: a directory that is briefly unavailable must degrade to "type the address yourself",
 * never to a broken invite dialog.
 *
 * `AUTHENTIK_DIRECTORY_GROUP` (optional) restricts the result to one Authentik group — set it to the
 * Fachschaft group so the picker cannot expose accounts that have nothing to do with this instance.
 * Service accounts are excluded via `type=internal`, deactivated accounts via `is_active=true`, and
 * users without an email are dropped because an invite is addressed by email.
 */
export const searchAuthentikMembers = async (query: string): Promise<TAuthentikDirectoryMember[]> => {
  if (!isAuthentikDirectoryConfigured()) return [];

  const params = new URLSearchParams({
    is_active: "true",
    type: "internal",
    ordering: "name",
    page_size: String(RESULT_LIMIT),
  });
  const trimmedQuery = query.trim();
  if (trimmedQuery) params.set("search", trimmedQuery);
  if (AUTHENTIK_DIRECTORY_GROUP) params.set("groups_by_name", AUTHENTIK_DIRECTORY_GROUP);

  try {
    const response = await fetch(`${AUTHENTIK_URL?.replace(/\/+$/, "")}/api/v3/core/users/?${params}`, {
      headers: {
        Authorization: `Bearer ${AUTHENTIK_API_TOKEN}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.error(
        { status: response.status },
        "FSINF Authentik directory: user lookup failed, falling back to manual entry"
      );
      return [];
    }

    const body = (await response.json()) as { results?: AuthentikUser[] };
    return (body.results ?? [])
      .filter((user): user is AuthentikUser & { email: string } => Boolean(user.email))
      .map((user) => ({
        id: String(user.pk ?? user.email),
        // Authentik's `name` is the display name and may be empty on imported accounts; the username
        // is always set, so it is the fallback the invite form pre-fills.
        name: user.name?.trim() || user.username?.trim() || user.email,
        email: user.email,
        username: user.username?.trim() || "",
      }))
      .slice(0, RESULT_LIMIT);
  } catch (error) {
    logger.error(error, "FSINF Authentik directory: user lookup failed, falling back to manual entry");
    return [];
  }
};

/**
 * Shared fetch for the Authentik API. Returns null on any failure so callers can tell "Authentik said
 * nothing" apart from "Authentik said the empty list" — the team sync depends on that distinction:
 * treating an outage as "user is in no groups" would revoke everyone's access.
 */
const authentikGet = async (path: string, params: URLSearchParams): Promise<unknown | null> => {
  if (!isAuthentikDirectoryConfigured()) return null;

  try {
    const response = await fetch(`${AUTHENTIK_URL?.replace(/\/+$/, "")}${path}?${params}`, {
      headers: {
        Authorization: `Bearer ${AUTHENTIK_API_TOKEN}`,
        Accept: "application/json",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      logger.error({ status: response.status, path }, "FSINF Authentik directory: request failed");
      return null;
    }

    return await response.json();
  } catch (error) {
    logger.error({ error, path }, "FSINF Authentik directory: request failed");
    return null;
  }
};

/**
 * The Authentik groups of one person, by email. Null means "could not ask" (see authentikGet); an
 * empty array means "asked, and they are in no groups", which the team sync acts on.
 */
export const getAuthentikGroupsForEmail = async (email: string): Promise<string[] | null> => {
  const body = (await authentikGet("/api/v3/core/users/", new URLSearchParams({ email }))) as {
    results?: { groups_obj?: { name?: string }[] }[];
  } | null;
  if (!body) return null;

  const user = body.results?.[0];
  if (!user) return []; // no such account in Authentik → no groups, which is a real answer

  return (user.groups_obj ?? []).map((group) => group.name ?? "").filter(Boolean);
};

/**
 * Every group name the instance knows. The team sync uses it to decide which Formbricks teams are
 * mirrored from Authentik at all — see fsinf-team-sync.ts.
 */
export const listAuthentikGroupNames = async (): Promise<string[] | null> => {
  const names: string[] = [];
  // Authentik pages this endpoint; a Fachschaft has a handful of groups, but paging keeps it correct
  // if that ever grows.
  for (let page = 1; page <= 10; page++) {
    const body = (await authentikGet(
      "/api/v3/core/groups/",
      new URLSearchParams({ page: String(page), page_size: "100" })
    )) as { results?: { name?: string }[]; pagination?: { next?: number } } | null;
    if (!body) return null;

    names.push(...(body.results ?? []).map((group) => group.name ?? "").filter(Boolean));
    if (!body.pagination?.next) break;
  }
  return names;
};

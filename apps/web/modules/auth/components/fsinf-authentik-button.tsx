"use client";

import { useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/modules/auth/lib/auth-client";
import { Button } from "@/modules/ui/components/button";

interface FsinfAuthentikButtonProps {
  displayName: string;
  returnToUrl?: string;
  /** e.g. "https://forms.nak-inf.de" — the fixed OIDC redirect_uri registered in Authentik. */
  canonicalOrigin: string;
}

const AUTO_SSO_PARAM = "fsinfSso";

/**
 * FSINF: our own SSO button for the Authentik provider registered in fsinf-sso-config.ts. Deliberately
 * lives outside modules/ee/sso — see that file's comment for why.
 *
 * forms.nak-inf.de and forms.nak-studis.de are two DIFFERENT domains serving the same app, but
 * Authentik's redirect_uri (and Better Auth's baseURL) is fixed to the canonical forms.nak-inf.de.
 * The OAuth "state" cookie Better Auth sets when initiating sign-in is scoped to whichever origin the
 * request went to — if that's forms.nak-studis.de but the callback lands on forms.nak-inf.de, the
 * cookie never arrives there and Better Auth rejects the callback with `error=state_mismatch`.
 * Fix: when not already on the canonical origin, do a full top-level navigation there first (carrying
 * an auto-continue flag), so sign-in initiates AND completes on the same domain as the cookie.
 */
export const FsinfAuthentikButton = ({
  displayName,
  returnToUrl,
  canonicalOrigin,
}: Readonly<FsinfAuthentikButtonProps>) => {
  const searchParams = useSearchParams();

  const startOAuth = useCallback(async () => {
    await authClient.signIn.oauth2({
      providerId: "fsinf-authentik",
      callbackURL: returnToUrl || "/",
      errorCallbackURL: "/auth/login",
    });
  }, [returnToUrl]);

  const handleLogin = useCallback(async () => {
    if (typeof window !== "undefined" && window.location.origin !== canonicalOrigin) {
      const params = new URLSearchParams();
      if (returnToUrl) params.set("callbackUrl", returnToUrl);
      params.set(AUTO_SSO_PARAM, "1");
      window.location.href = `${canonicalOrigin}/auth/login?${params.toString()}`;
      return;
    }
    await startOAuth();
  }, [canonicalOrigin, returnToUrl, startOAuth]);

  // Landed back on the canonical origin after the cross-domain hop above — continue automatically.
  useEffect(() => {
    if (typeof window !== "undefined" && searchParams.get(AUTO_SSO_PARAM) === "1") {
      void startOAuth();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Button
      type="button"
      onClick={handleLogin}
      variant="secondary"
      className="w-full items-center justify-center gap-2 px-2">
      <span className="truncate">Login mit {displayName}</span>
    </Button>
  );
};

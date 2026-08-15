"use client";

import { useCallback } from "react";
import { authClient } from "@/modules/auth/lib/auth-client";
import { Button } from "@/modules/ui/components/button";

interface FsinfAuthentikButtonProps {
  displayName: string;
  returnToUrl?: string;
}

/**
 * FSINF: our own SSO button for the Authentik provider registered in fsinf-sso-config.ts. Deliberately
 * lives outside modules/ee/sso — see that file's comment for why.
 */
export const FsinfAuthentikButton = ({ displayName, returnToUrl }: Readonly<FsinfAuthentikButtonProps>) => {
  const handleLogin = useCallback(async () => {
    await authClient.signIn.oauth2({
      providerId: "fsinf-authentik",
      callbackURL: returnToUrl || "/",
      errorCallbackURL: "/auth/login",
    });
  }, [returnToUrl]);

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

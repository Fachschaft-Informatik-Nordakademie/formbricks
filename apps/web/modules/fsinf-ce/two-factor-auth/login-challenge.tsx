"use client";

import type { UseFormReturn } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { FormControl, FormField, FormItem } from "@/modules/ui/components/form";
import { Input } from "@/modules/ui/components/input";
import { OTPInput } from "@/modules/ui/components/otp-input";

/**
 * FSINF CE: the inline second-factor step of the email/password login.
 *
 * Better Auth's twoFactor plugin (AGPL core) still issues the TOTP challenge for accounts that have
 * two-factor enabled; these fields only collect the code the login form verifies. Enrolling or
 * disabling 2FA is not part of this build — sign-in to this instance goes through Authentik, which
 * enforces its own MFA.
 */
type TLoginChallengeForm = UseFormReturn<{
  email: string;
  password: string;
  totpCode?: string;
  backupCode?: string;
}>;

interface LoginChallengeProps {
  form: TLoginChallengeForm;
}

const TOTP_LENGTH = 6;

export const TwoFactor = ({ form }: Readonly<LoginChallengeProps>) => {
  const { t } = useTranslation();
  return (
    <FormField
      control={form.control}
      name="totpCode"
      render={({ field }) => (
        <FormItem className="mb-2">
          <FormControl>
            <OTPInput
              value={field.value ?? ""}
              valueLength={TOTP_LENGTH}
              onChange={field.onChange}
              containerClassName="justify-center"
            />
          </FormControl>
          <p className="sr-only">{t("auth.login.enter_your_two_factor_authentication_code")}</p>
        </FormItem>
      )}
    />
  );
};

export const TwoFactorBackup = ({ form }: Readonly<LoginChallengeProps>) => {
  const { t } = useTranslation();
  return (
    <FormField
      control={form.control}
      name="backupCode"
      render={({ field }) => (
        <FormItem className="mb-2">
          <FormControl>
            <Input
              id="backupCode"
              autoComplete="one-time-code"
              placeholder={t("auth.login.backup_code")}
              aria-label={t("auth.login.backup_code")}
              value={field.value ?? ""}
              onChange={field.onChange}
            />
          </FormControl>
        </FormItem>
      )}
    />
  );
};

import { Metadata } from "next";
import Script from "next/script";
import React from "react";
import { NoScriptWarning } from "@/app/components/NoScriptWarning";
import { DEFAULT_LOCALE } from "@/lib/constants";
import { SentryClientConfigScript } from "@/lib/sentry/SentryClientConfigScript";
import { I18nProvider } from "@/lingodotdev/client";
import { getLocale } from "@/lingodotdev/language";
import "../modules/ui/globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | FS INF Formulare",
    default: "FS INF Formulare",
  },
  description: "Formulare der Fachschaft Informatik der NORDAKADEMIE",
};

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const locale = await getLocale();

  return (
    <html lang={locale} translate="no">
      <body className="flex h-dvh flex-col transition-all ease-in-out">
        {/* First in the document so instrumentation-client.ts can start Sentry as early as possible. */}
        <SentryClientConfigScript />
        {/* FS INF Analytics (self-hosted Umami fork) */}
        <Script
          defer
          src="https://analytics.nak-inf.de/script.js"
          data-website-id="829beb0b-6a80-4942-ac24-18230894aa61"
        />
        <NoScriptWarning locale={locale} />
        <I18nProvider language={locale} defaultLanguage={DEFAULT_LOCALE}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
};

export default RootLayout;

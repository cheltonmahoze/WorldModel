import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { AppProviders } from "@/components/providers";
import { env } from "@/server/env";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${env.APP_NAME} — AI Revenue & Operations Intelligence`,
    template: `%s · ${env.APP_NAME}`,
  },
  description:
    "Nexus OS turns scattered commercial, operational and financial data into prioritised action: where you are losing money, where the growth is, and what to execute now.",
  applicationName: env.APP_NAME,
  metadataBase: new URL(env.APP_URL),
  openGraph: {
    title: `${env.APP_NAME} — Your business, decoded.`,
    description: "AI Revenue & Operations Intelligence Platform for B2B revenue teams.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Applies the stored theme before paint to avoid a flash of the wrong palette.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('nexus-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&m)){document.documentElement.classList.add('dark')}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <AppProviders>{children}</AppProviders>
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "group rounded-xl border border-border/70 bg-popover text-popover-foreground shadow-lifted text-sm",
              description: "text-muted-foreground text-xs",
            },
          }}
        />
      </body>
    </html>
  );
}

import { Inter } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AccentProvider } from "@/components/accent-provider";
import { LanguageProvider } from "@/components/language-provider";
import { MidnightRefresh } from "@/components/midnight-refresh";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Habit Tracker",
  description: "Local-first habit tracker with flexible schedules",
};

/**
 * Browser chrome (mobile status bar, PWA-style tint) follows the neutral page
 * background: `--background` is oklch(0.985 0 0) / #fafafa in the light theme
 * and oklch(0.145 0 0) / #0a0a0a in dark. It is deliberately not per-accent:
 * themeColor is static metadata, while the accent is a localStorage value
 * applied by the pre-paint script below, so a per-accent colour would need a
 * client-side update (out of scope here). `colorScheme` lists both schemes so
 * the UA renders native controls (scrollbars, form widgets) for whichever one
 * next-themes applied.
 */
export const viewport: Viewport = {
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

/**
 * Applies the stored appearance preferences (accent color, density, language)
 * before first paint. Keep the storage keys and the accent list in sync with
 * src/lib/appearance.ts (the script cannot import modules).
 */
const appearanceInitScript = `try{
var accents=["blue","violet","emerald","orange","rose"];
var accent=localStorage.getItem("habit-tracker:accent");
if(accents.indexOf(accent)===-1)accent="blue";
document.documentElement.setAttribute("data-accent",accent);
var density=localStorage.getItem("habit-tracker:density");
if(density==="compact")document.documentElement.setAttribute("data-density","compact");
var language=localStorage.getItem("habit-tracker:language");
if(language==="ru"||language==="en")document.documentElement.lang=language;
}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: appearanceInitScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          <AccentProvider>
            <MidnightRefresh />
            <LanguageProvider>
              <SidebarProvider>
                <AppSidebar />
                <SidebarInset>
                  <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
                    <SidebarTrigger className="-ml-1" />
                  </header>
                  <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
                </SidebarInset>
              </SidebarProvider>
            </LanguageProvider>
          </AccentProvider>
        </Providers>
      </body>
    </html>
  );
}

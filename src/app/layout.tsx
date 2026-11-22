import { Inter } from "next/font/google";
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

export const metadata = {
  title: "Habit Tracker",
  description: "Local-first habit tracker with flexible schedules",
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

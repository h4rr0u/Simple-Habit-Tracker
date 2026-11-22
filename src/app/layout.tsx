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
 * Applies the stored appearance preferences (accent color, density) before
 * first paint. Keep the storage keys in sync with src/lib/appearance.ts.
 */
const appearanceInitScript = `try{
var a=localStorage.getItem("habit-tracker:accent");
if(a&&a!=="blue")document.documentElement.setAttribute("data-accent",a);
var d=localStorage.getItem("habit-tracker:density");
if(d==="compact")document.documentElement.setAttribute("data-density","compact");
var l=localStorage.getItem("habit-tracker:language");
if(l==="ru"||l==="en")document.documentElement.lang=l;
}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: appearanceInitScript }} />
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

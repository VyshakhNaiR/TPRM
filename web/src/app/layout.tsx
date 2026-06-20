import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AnimatedBackground } from "@/components/animated-background";

export const metadata: Metadata = {
  title: "Network Intelligence — TPRM Platform",
  description:
    "Network Intelligence TPRM: vendor risk assessment with AI evidence adjudication and live MAS / RBI / SEBI CSCRF regulatory auto-mapping.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AnimatedBackground />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

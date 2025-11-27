import type { Metadata } from "next";
import "./custom.css";
import { Toaster } from "@/components/ui/toaster";
import { AppProviders } from "@/components/app-providers";

export const metadata: Metadata = {
  title: "FineLine Dashboard",
  description: "Your personal finance overview.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-body antialiased">
        <AppProviders>{children}</AppProviders>
        <Toaster />
      </body>
    </html>
  );
}

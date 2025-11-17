import type { Metadata } from "next";
import ClientLayout from "./layout-client";
import "./globals.css";

export const metadata: Metadata = {
  title: "Filma Workspace",
  description: "Gestión de proyectos audiovisuales",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&family=Space+Grotesk:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body
        suppressHydrationWarning
        className="font-sans antialiased"
      >
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
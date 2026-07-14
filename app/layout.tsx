import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Audrey",
  description:
    "Iterate on architectural images with AI — edit a source photo with layered prompts or generate from scratch.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

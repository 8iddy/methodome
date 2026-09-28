import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Methodome",
  description: "Structured research analysis workspace"
};

const themeBootScript = `
(() => {
  try {
    const saved = localStorage.getItem("methodome-theme");
    const theme =
      saved === "light" || saved === "dark"
        ? saved
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = "light";
  }
})();
`;

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

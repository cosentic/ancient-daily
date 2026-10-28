import "./globals.css";

export const metadata = {
  title: "Ancient Daily",
  description: "One article about the ancient world, every day.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

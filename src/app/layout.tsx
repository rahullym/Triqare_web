import type { Metadata } from "next";
import { AuthProvider } from '@/components/auth/AuthProvider'
import { Toaster } from "@/components/ui/sonner"
import "./globals.css";

export const metadata: Metadata = {
  title: "Emergency Response",
  description: "Emergency response management platform",
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressContentEditableWarning>
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}

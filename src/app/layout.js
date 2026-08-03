import { Geist, Geist_Mono } from "next/font/google";
import ChunkErrorRecovery from "@/components/system/ChunkErrorRecovery";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "SubCustody Cell War - by Income Team ",
  description: "Eat your enemies and grow bigger in this multiplayer cell arena.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ChunkErrorRecovery />
        {children}
      </body>
    </html>
  );
}

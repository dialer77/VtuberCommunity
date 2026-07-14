import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "버모아 · VMOA — 지금 방송 중인 버튜버",
    template: "%s · 버모아 VMOA",
  },
  description:
    "치지직·SOOP·유튜브에 흩어진 한국 버튜버의 실시간 방송 현황, 신규 데뷔, 이슈를 한 곳에서.",
};

// 페인트 전에 저장된 테마를 적용해 깜빡임(FOUC) 방지
const themeInit = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
        <SiteHeader />
        <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-8">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}

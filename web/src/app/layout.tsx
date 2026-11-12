import type { Metadata } from "next";
import localFont from "next/font/local";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { PlayerProvider } from "@/components/player/player-provider";
import { AuthProviders } from "@/components/auth/auth-providers";

const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

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

const DESCRIPTION =
  "치지직·SOOP·유튜브에 흩어진 한국 버튜버의 실시간 방송 현황, 신규 데뷔, 이슈를 한 곳에서.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "버모아 · VMOA — 지금 방송 중인 버튜버",
    template: "%s · 버모아 VMOA",
  },
  description: DESCRIPTION,
  applicationName: "버모아 VMOA",
  openGraph: {
    type: "website",
    siteName: "버모아 VMOA",
    locale: "ko_KR",
    title: "버모아 · VMOA — 지금 방송 중인 버튜버",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "버모아 · VMOA",
    description: DESCRIPTION,
  },
  // 검색엔진 소유 확인 (HTML 태그 방식을 쓸 때만). 도메인 속성(DNS TXT)으로 확인했다면 비워둬도 된다.
  verification: {
    google: process.env.GOOGLE_SITE_VERIFICATION || undefined,
    other: process.env.NAVER_SITE_VERIFICATION
      ? { "naver-site-verification": process.env.NAVER_SITE_VERIFICATION }
      : undefined,
  },
  // 애드센스 사이트 소유권 확인 (메타 태그 방식). 광고 스크립트는 페이지가 뜬 뒤에 붙어서 검사기가 못 볼 수 있다
  other: ADSENSE_CLIENT ? { "google-adsense-account": ADSENSE_CLIENT } : undefined,
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
        {/* 애드센스: 공식 안내대로 HTML 에 그대로 들어가는 async 스크립트 (React 가 <head> 로 옮긴다). next/script 는 HTML 에 preload 만 남아 소유권 확인에서 못 찾을 수 있다 */}
        {ADSENSE_CLIENT ? (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
          />
        ) : null}
        {/* 전역 유튜브 플레이어 — 페이지를 옮겨도 재생이 이어진다 */}
        <AuthProviders>
          <PlayerProvider>
            <SiteHeader />
            <main className="flex-1 w-full max-w-6xl mx-auto px-5 py-8">
              {children}
            </main>
            <SiteFooter />
          </PlayerProvider>
        </AuthProviders>
      </body>
    </html>
  );
}

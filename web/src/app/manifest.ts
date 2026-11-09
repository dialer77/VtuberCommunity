import type { MetadataRoute } from "next";

// 아이폰 웹 푸시는 '홈 화면에 추가'한 앱에서만 동작하므로 설치 정보를 제공한다
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "버모아 VMOA",
    short_name: "버모아",
    description: "한국 버튜버의 지금을 한 화면에서.",
    start_url: "/",
    display: "standalone",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}

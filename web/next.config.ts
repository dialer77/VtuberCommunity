import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // 로그인에 필요한 값이 모두 있어야 로그인 UI 를 켠다 (lib/auth.ts 의 authEnabled 와 같은 조건). 빌드 시점에 고정되므로 값을 넣은 뒤 재배포 필요
    NEXT_PUBLIC_AUTH_ENABLED:
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.NEXTAUTH_SECRET &&
      process.env.INTERNAL_SECRET
        ? "1"
        : "",
  },
};

export default nextConfig;

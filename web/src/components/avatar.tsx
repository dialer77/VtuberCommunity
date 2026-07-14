import { PLATFORMS, type Platform } from "@/types";

/** 프로필 이미지 연결 전, 플랫폼 컬러 기반 이니셜 아바타 (자리표시) */
export function Avatar({
  name,
  platform,
  size = 40,
}: {
  name: string;
  platform: Platform;
  size?: number;
}) {
  const color = PLATFORMS[platform].color;
  const initial = name.trim().charAt(0);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-foreground/80 shrink-0 select-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `linear-gradient(135deg, ${color}33, ${color}12)`,
        border: `1px solid ${color}44`,
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}

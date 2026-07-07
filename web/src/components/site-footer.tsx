export function SiteFooter() {
  return (
    <footer className="border-t border-border mt-8">
      <div className="max-w-6xl mx-auto px-5 py-8 text-sm text-muted-2 flex flex-col gap-2">
        <p>
          <span className="font-semibold text-muted">버모아 · VMOA</span> —
          한국 버튜버 실시간 허브 (v0.1 뼈대 · 목 데이터)
        </p>
        <p className="text-xs">
          표시 데이터는 자리표시용 예시입니다. 정식 데이터는 각 플랫폼 API를
          통해 수집되며 출처를 표기합니다.
        </p>
      </div>
    </footer>
  );
}

"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h1 className="text-2xl font-extrabold tracking-tight">
        문제가 발생했어요
      </h1>
      <p className="text-muted max-w-sm">
        일시적인 오류일 수 있어요. 잠시 후 다시 시도해 주세요.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-accent text-accent-fg font-semibold px-4 py-2 hover:opacity-90 transition-opacity"
      >
        다시 시도
      </button>
    </div>
  );
}

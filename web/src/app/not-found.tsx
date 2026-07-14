import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="font-mono text-5xl font-black text-accent">404</span>
      <h1 className="text-xl font-bold">페이지를 찾을 수 없어요</h1>
      <p className="text-muted">주소가 바뀌었거나 존재하지 않는 페이지예요.</p>
      <Link
        href="/"
        className="rounded-md bg-accent text-accent-fg font-semibold px-4 py-2 hover:opacity-90 transition-opacity"
      >
        홈으로
      </Link>
    </div>
  );
}

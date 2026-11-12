"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { PlatformBadge } from "@/components/platform-badge";
import { SearchIcon } from "@/components/search/header-search";
import { formatCount, formatDate, formatYmd } from "@/lib/format";
import { ClipGrid } from "@/components/clip-card";
import type { Clip, SearchResponse, SearchResult, TagCount, TagKind, VmoaTag } from "@/types";

export const PAGE_SIZE = 30;
const KIND_LABEL: Record<TagKind, string> = { agency: "소속사", concept: "컨셉", content: "콘텐츠" };
const KIND_ORDER: TagKind[] = ["agency", "concept", "content"];

interface Query {
  q: string;
  /** 주소의 tag (칩으로 고른 태그). 검색어 안의 '#태그' 는 검색어에 남는다 */
  tags: string[];
  offset: number;
}

export function searchPath(s: Query): string {
  const sp = new URLSearchParams();
  if (s.q.trim()) sp.set("q", s.q.trim());
  if (s.tags.length) sp.set("tag", s.tags.join(","));
  if (s.offset > 0) sp.set("offset", String(s.offset));
  const str = sp.toString();
  return str ? `/search?${str}` : "/search";
}

function queryFromLocation(): Query {
  const sp = new URLSearchParams(window.location.search);
  return {
    q: (sp.get("q") ?? "").slice(0, 100),
    tags: sp
      .getAll("tag")
      .flatMap((t) => t.split(","))
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 10),
    offset: Math.max(Number(sp.get("offset")) || 0, 0),
  };
}

const normTag = (s: string) => s.toLowerCase().replace(/[\s#]/g, "");

/** 검색어에서 이 태그를 가리키는 '#…' 를 뺀다 (태그 칩을 눌러 끌 때) */
function stripTagTokens(q: string, t: VmoaTag): string {
  const label = normTag(t.label);
  return q
    .split(/\s+/)
    .filter((tok) => {
      if (!tok.startsWith("#")) return true;
      const n = normTag(tok);
      return !(n && (label.includes(n) || t.id === n));
    })
    .join(" ")
    .trim();
}

/**
 * 검색 화면. 첫 화면은 서버가 그리고, 이후 입력·태그·페이지 이동은 결과만 받아와 바꾼다
 * (입력마다 페이지 전체를 서버에서 다시 받지 않는다). 주소는 history API 로 맞춰 둔다.
 */
export function SearchView({ initial, initialQuery }: { initial: SearchResponse | null; initialQuery: Query }) {
  // 다른 페이지에서 뒤로 왔을 때 Next.js 가 예전 화면(예전 검색어)을 복원할 수 있어 주소를 기준으로 시작한다
  // (처음 접속 때는 주소 = 서버가 읽은 값이라 하이드레이션 결과가 같다)
  const [query, setQuery] = useState<Query>(() =>
    typeof window !== "undefined" && window.location.pathname === "/search" ? queryFromLocation() : initialQuery,
  );
  const [data, setData] = useState<SearchResponse | null>(initial);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(initial === null);
  const abortRef = useRef<AbortController | null>(null);
  const loadedKey = useRef(searchPath(initialQuery));
  const pendingKey = useRef<string | null>(null);

  const load = useCallback(async (next: Query) => {
    const key = searchPath(next);
    if (key === loadedKey.current || key === pendingKey.current) return;
    pendingKey.current = key;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const sp = new URLSearchParams(key.split("?")[1] ?? "");
      sp.set("limit", String(PAGE_SIZE));
      const res = await fetch(`/api/search?${sp}`, { signal: ac.signal });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as SearchResponse);
      setFailed(false);
      loadedKey.current = key;
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setFailed(true);
    }
    if (abortRef.current === ac) {
      pendingKey.current = null;
      setLoading(false);
    }
  }, []);

  /** 칩·예시·페이지 이동: 바로 불러오고 방문 기록에 남긴다 */
  const apply = (next: Query, scrollTop = false) => {
    setQuery(next);
    const path = searchPath(next);
    if (path !== window.location.pathname + window.location.search) window.history.pushState(null, "", path);
    void load(next);
    if (scrollTop) window.scrollTo({ top: 0 });
  };

  // 입력: 멈추면 0.25초 뒤 불러오고, 주소는 바꾸되 방문 기록은 늘리지 않는다.
  // 처음 그릴 때 결과가 주소와 다르면(뒤로 가기로 예전 화면이 복원된 경우) 바로 다시 불러온다.
  const firstRun = useRef(true);
  useEffect(() => {
    const delay = firstRun.current ? 0 : 250;
    firstRun.current = false;
    const path = searchPath(query);
    if (path === loadedKey.current || path === pendingKey.current) return;
    const h = setTimeout(() => {
      if (path !== window.location.pathname + window.location.search) window.history.replaceState(null, "", path);
      void load(query);
    }, delay);
    return () => clearTimeout(h);
  }, [query, load]);

  // 뒤로·앞으로: 주소에 맞춰 다시 불러온다
  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname !== "/search") return;
      const next = queryFromLocation();
      setQuery(next);
      void load(next);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [load]);

  const applied = data ? data.tags.map((t) => t.id) : [];
  const browsing = !query.q.trim() && applied.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          (e.currentTarget.querySelector("input") as HTMLInputElement | null)?.blur();
        }}
        className="relative"
      >
        <label className="sr-only" htmlFor="vtuber-search">
          버튜버 검색
        </label>
        <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-2" />
        <input
          id="vtuber-search"
          type="search"
          value={query.q}
          onChange={(e) => setQuery({ ...query, q: e.target.value, offset: 0 })}
          placeholder="이름, 초성(ㅅㅌㄹ), #태그"
          autoComplete="off"
          enterKeyHint="search"
          autoFocus={!initialQuery.q && initialQuery.tags.length === 0}
          className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-10 text-base placeholder:text-muted-2 focus:border-accent/60 focus:outline-none"
        />
        {loading ? (
          <span
            className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-muted-2 border-t-transparent"
            aria-hidden
          />
        ) : null}
      </form>

      {failed && !data ? (
        <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
          지금은 검색 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.
        </p>
      ) : data ? (
        <>
          <TagFilter
            counts={data.tagCounts}
            applied={applied}
            onToggle={(t, on) =>
              apply(
                on
                  ? { q: stripTagTokens(query.q, t), tags: query.tags.filter((id) => id !== t.id), offset: 0 }
                  : { q: query.q, tags: [...query.tags, t.id], offset: 0 },
              )
            }
          />

          {data.suggestedTags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-2">태그로 보기</span>
              {data.suggestedTags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => apply({ q: "", tags: [t.id], offset: 0 })}
                  className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 text-accent hover:bg-accent/15"
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          ) : null}

          <section className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
            <h2 className="text-sm font-bold text-muted" aria-live="polite">
              {data.unknownTags.length > 0
                ? `'${data.unknownTags.join("', '")}' 태그는 없어요`
                : browsing
                  ? "많이 본 버튜버 (최근 30일)"
                  : `검색 결과 ${formatCount(data.total)}명`}
            </h2>

            {browsing ? (
              <p className="text-xs text-muted-2">
                예:{" "}
                {["아야", "ㅅㅌ", "#노래", "유 #스텔라이브"].map((ex, i) => (
                  <span key={ex}>
                    {i > 0 ? " · " : ""}
                    <button type="button" onClick={() => apply({ q: ex, tags: [], offset: 0 })} className="text-accent hover:underline">
                      {ex}
                    </button>
                  </span>
                ))}
              </p>
            ) : null}

            {data.results.length === 0 ? (
              data.unknownTags.length > 0 ? (
                <p className="text-sm text-muted">위 태그 중에서 골라 보세요.</p>
              ) : (
                <p className="rounded-xl border border-border bg-surface p-5 text-sm text-muted">
                  찾는 버튜버가 없어요. 이름의 일부나 초성으로도 찾아보세요. 버모아가 아직 방송을 본 적 없는 채널은 나오지 않아요.
                </p>
              )
            ) : (
              <ol className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface">
                {data.results.map((r) => (
                  <ResultRow key={`${r.platform}:${r.channelId}`} r={r} />
                ))}
              </ol>
            )}

            {data.total > PAGE_SIZE ? (
              <nav className="flex items-center justify-between text-sm" aria-label="검색 결과 페이지">
                <button
                  type="button"
                  disabled={query.offset === 0}
                  onClick={() => apply({ ...query, offset: Math.max(query.offset - PAGE_SIZE, 0) }, true)}
                  className="text-muted hover:text-accent disabled:invisible"
                >
                  ← 이전
                </button>
                <span className="text-muted-2 tabular-nums">
                  {query.offset + 1}–{Math.min(query.offset + PAGE_SIZE, data.total)} / {formatCount(data.total)}
                </span>
                <button
                  type="button"
                  disabled={query.offset + PAGE_SIZE >= data.total}
                  onClick={() => apply({ ...query, offset: query.offset + PAGE_SIZE }, true)}
                  className="text-muted hover:text-accent disabled:invisible"
                >
                  다음 →
                </button>
              </nav>
            ) : null}
          </section>
        </>
      ) : null}

      <ClipResults q={query.q} />
    </div>
  );
}

/** 같은 검색어로 찾은 키리누키 (제목·요약·게임·사건·버튜버·채널) */
function ClipResults({ q }: { q: string }) {
  const [res, setRes] = useState<{ q: string; total: number; clips: Clip[] } | null>(null);
  const text = q.trim();
  useEffect(() => {
    if (!text) return;
    const ac = new AbortController();
    const h = setTimeout(() => {
      fetch(`/api/clip-search?q=${encodeURIComponent(text)}&limit=6`, { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : { total: 0, clips: [] }))
        .then((j: { total?: number; clips?: Clip[] }) => setRes({ q: text, total: j.total ?? 0, clips: j.clips ?? [] }))
        .catch(() => undefined);
    }, 300);
    return () => {
      clearTimeout(h);
      ac.abort();
    };
  }, [text]);
  if (!text || !res || res.q !== text || res.total === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="키리누키 검색 결과">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold text-muted">키리누키 {formatCount(res.total)}개</h2>
        <Link href={`/clips?q=${encodeURIComponent(text)}`} className="text-sm text-accent hover:underline">
          클립 모두 보기 →
        </Link>
      </div>
      <ClipGrid clips={res.clips} narrow />
    </section>
  );
}

function TagFilter({
  counts,
  applied,
  onToggle,
}: {
  counts: TagCount[];
  applied: string[];
  onToggle: (t: VmoaTag, on: boolean) => void;
}) {
  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: counts
      .filter((t) => t.kind === kind && (t.count > 0 || applied.includes(t.id)))
      .sort((a, b) => b.count - a.count),
  })).filter((g) => g.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {groups.map((g) => (
        <div key={g.kind} className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 shrink-0 text-[11px] font-semibold text-muted-2">{KIND_LABEL[g.kind]}</span>
          {g.items.map((t) => {
            const on = applied.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(t, on)}
                className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[13px] transition-colors ${
                  on
                    ? "border-accent bg-accent text-accent-fg font-semibold"
                    : "border-border bg-surface text-muted hover:border-accent/50 hover:text-foreground"
                }`}
              >
                {t.emoji} {t.label}
                <span className={`ml-1 tabular-nums ${on ? "opacity-80" : "text-muted-2"}`}>{t.count}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function lastSeenText(r: SearchResult): string {
  if (r.lastLiveDate) return `마지막 방송 ${formatYmd(r.lastLiveDate)}`;
  return `처음 본 날 ${formatDate(r.firstSeenAt)}`;
}

function ResultRow({ r }: { r: SearchResult }) {
  return (
    <li className="border-b border-border last:border-b-0">
      <Link
        prefetch={false}
        href={`/vtuber/${r.platform}/${encodeURIComponent(r.channelId)}`}
        className="flex items-center gap-3 p-3 transition-colors hover:bg-surface-2"
      >
        <Avatar name={r.name} platform={r.platform} size={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-semibold">{r.name}</span>
            <PlatformBadge platform={r.platform} />
            {r.isLive ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded bg-live px-1.5 py-0.5 text-[10px] font-bold text-white">
                LIVE{r.livePlatform === "youtube" ? " · 유튜브" : ""}
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-2">
            {r.matchedName ? <span className="text-muted">다른 이름: {r.matchedName} · </span> : null}
            {r.isLive ? `${formatCount(r.viewers ?? 0)}명 시청 중 · ${r.liveTitle ?? ""}` : lastSeenText(r)}
          </span>
          {r.tags.length > 0 ? (
            <span className="mt-1 flex flex-wrap gap-1">
              {r.tags.map((t) => (
                <span key={t.id} className="rounded-full bg-accent/10 px-1.5 py-0.5 text-[11px] text-accent">
                  {t.emoji} {t.label}
                </span>
              ))}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

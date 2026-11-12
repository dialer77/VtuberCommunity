import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClip, getClipTags } from "@/lib/data";
import { PlayVideo } from "@/components/player/play-video";
import { RemoteImage } from "@/components/remote-image";
import { ClipGrid, ClipNotice, ClipTagChip } from "@/components/clip-card";
import { formatDate, formatYmd } from "@/lib/format";
import { PLATFORMS } from "@/types";
import { ClipActions } from "@/components/clip-actions";

export const dynamic = "force-dynamic";

type Params = Promise<{ videoId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { videoId } = await params;
  const d = await getClip(videoId);
  if (!d) return { title: "클립을 찾을 수 없음" };
  const who = d.clip.vtubers.map((v) => v.name).join(", ");
  return {
    title: d.clip.title,
    description: [who, d.clip.summary, d.clip.topic].filter(Boolean).join(" · ") || d.clip.title,
  };
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <span className="w-16 shrink-0 text-muted-2">{label}</span>
      <div className="min-w-0 flex-1 flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

export default async function ClipPage({ params }: { params: Params }) {
  const { videoId } = await params;
  const [d, tags] = await Promise.all([getClip(videoId), getClipTags()]);
  if (!d) notFound();
  const c = d.clip;

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <Link href="/clips" className="text-sm text-muted hover:text-accent transition-colors w-fit">
        ← 키리누키
      </Link>

      <PlayVideo
        video={{ id: c.videoId, title: c.title, channel: c.channelTitle }}
        className="group relative block w-full aspect-video overflow-hidden rounded-xl border border-border bg-black"
      >
        <RemoteImage src={c.thumbnailUrl} className="absolute inset-0 h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/60 text-3xl text-white shadow-lg transition-transform group-hover:scale-110">
            ▶
          </span>
        </span>
      </PlayVideo>

      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-bold leading-snug">{c.title}</h1>
        <p className="text-sm text-muted-2">
          <a href={c.channelUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
            {c.channelTitle ?? "YouTube"} ↗
          </a>{" "}
          · {formatDate(c.publishedAt)}
        </p>
      </div>

      <ClipActions
        videoId={c.videoId}
        likes={c.likes ?? 0}
        tagVotes={d.tagVotes ?? []}
        allMoments={tags.filter((t) => t.kind === "moment")}
        margin={d.voteMargin ?? 2}
      />

      <section className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4" aria-label="버모아 분류">
        <p className="text-xs font-bold text-muted">버모아 분류</p>
        {c.summary ? <p className="text-[15px] font-medium">{c.summary}</p> : null}
        <Row label="누가">
          {c.vtubers.length ? (
            c.vtubers.map((v) => (
              <Link key={`${v.platform}:${v.channelId}`} href={`/vtuber/${v.platform}/${v.channelId}`} className="text-accent hover:underline">
                {v.name}
              </Link>
            ))
          ) : (
            <span className="text-muted-2">-</span>
          )}
        </Row>
        <Row label="무엇을">
          {c.category ? <ClipTagChip tag={c.category} href={`/clips?tag=${c.category.id}`} /> : null}
          {c.topic ? <span>{c.topic}</span> : null}
        </Row>
        <Row label="어떤 순간">
          {c.moments.length ? c.moments.map((m) => <ClipTagChip key={m.id} tag={m} href={`/clips?tag=${m.id}`} />) : <span className="text-muted-2">-</span>}
        </Row>
        {c.event ? (
          <Row label="어떤 일">
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-accent">{c.event}</span>
          </Row>
        ) : null}
        {c.source || c.sourceDate ? (
          <Row label="원본 방송">
            {c.sourceDate ? <span>{formatYmd(c.sourceDate)}</span> : null}
            {c.source ? (
              <a href={c.source.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                {PLATFORMS[c.source.platform].label} 다시보기 ↗
              </a>
            ) : null}
          </Row>
        ) : null}
      </section>

      {d.sameVtuber.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-muted">
            {c.vtubers[0] ? `${c.vtubers[0].name}의 비슷한 클립` : "같은 버튜버의 비슷한 클립"}
          </h2>
          <ClipGrid clips={d.sameVtuber} narrow />
        </section>
      ) : null}

      {d.otherVtuber.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-bold text-muted">다른 버튜버의 비슷한 클립</h2>
          <ClipGrid clips={d.otherVtuber} narrow />
        </section>
      ) : null}

      <ClipNotice />
    </div>
  );
}

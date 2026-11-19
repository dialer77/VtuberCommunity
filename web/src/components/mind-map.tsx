import Link from "next/link";
import type { EgoGraph, GraphNode, MapGroup } from "@/types";

/** 묶음 색 (밝은·어두운 화면 모두 읽히는 중간 채도) */
const COLOR: Record<string, string> = {
  member: "#8b5cf6",
  members: "#8b5cf6",
  collab: "#ec4899",
  people: "#ec4899",
  players: "#ec4899",
  mates: "#a78bfa",
  plays: "#10b981",
  game: "#10b981",
  similar: "#34d399",
  event: "#f59e0b",
  issue: "#3b82f6",
  mentions: "#3b82f6",
};
const colorOf = (key: string) => COLOR[key] ?? "#94a3b8";

const TYPE_LABEL: Record<GraphNode["type"], string> = {
  vtuber: "버튜버",
  agency: "소속사",
  group: "그룹",
  game: "게임·콘텐츠",
  event: "사건·밈",
  issue: "이슈",
};

const W = 1040;
const H = 640;
const CX = W / 2;
const CY = H / 2;
const SX = 1.38; // 가로로 넓은 타원
const SY = 0.92;
const HUB_R = 140;
const LEAF_R = [238, 288];
const MAX_LEAVES = 8;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const pt = (r: number, deg: number) => {
  const t = (deg * Math.PI) / 180;
  return { x: CX + r * Math.cos(t) * SX, y: CY + r * Math.sin(t) * SY };
};

/** 넓은 화면: 가운데 점 → 묶음 → 이웃 (마인드맵) */
function MapSvg({ graph, narrow }: { graph: EgoGraph; narrow?: boolean }) {
  // 좁은 칸(프로필)은 그림이 줄어드니 글자·이름표를 키운다
  const k = narrow ? 1.5 : 1;
  const leafChars = narrow ? 8 : 10;
  const groups = graph.groups.filter((g) => g.items.length > 0).slice(0, 6);
  // 작은 묶음도 이름표가 겹치지 않게 최소 각도를 준다
  const weights = groups.map((g) => Math.max(3, Math.min(g.items.length, MAX_LEAVES)));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  // 묶음마다 차지할 각도 (위쪽부터 시계 방향, 이웃 수에 비례)
  const sectors = groups.map((g, i) => ({
    g,
    start: -90 + (360 * weights.slice(0, i).reduce((a, b) => a + b, 0)) / total,
    span: (360 * weights[i]!) / total,
  }));
  const centerLines = cut(graph.center.label, narrow ? 9 : 14);
  return (
    <svg viewBox={`-20 0 ${W + 40} ${H}`} className="w-full h-auto text-foreground" role="img" aria-label={`${graph.center.label} 관계도`}>
      {sectors.map(({ g, start: s0, span }, gi) => {
        const mid = s0 + span / 2;
        // 이웃한 묶음 이름표가 겹치지 않게 거리를 번갈아
        // (홀수 개면 마지막은 첫 묶음과 맞닿으니 바깥으로)
        const outer = gi % 2 === 1 || (gi === sectors.length - 1 && sectors.length % 2 === 1 && sectors.length > 1);
        const hub = pt(outer ? HUB_R + 45 : HUB_R, mid);
        const leaves = g.items.slice(0, MAX_LEAVES);
        const pad = Math.min(8, span / 6);
        const step = (span - pad * 2) / Math.max(leaves.length, 1);
        const color = colorOf(g.key);
        return (
          <g key={g.key}>
            <line x1={CX} y1={CY} x2={hub.x} y2={hub.y} stroke={color} strokeWidth={3} strokeOpacity={0.55} />
            {leaves.map((it, j) => {
              const deg = s0 + pad + step * (j + 0.5);
              const r = LEAF_R[leaves.length > 4 ? j % 2 : 0]!;
              const p = pt(r, deg);
              const right = Math.cos((deg * Math.PI) / 180) >= 0;
              return (
                <a key={it.node.id} href={it.node.href}>
                  <title>{`${it.node.label} · ${TYPE_LABEL[it.node.type]}${it.weight > 1 ? ` · ${it.weight}` : ""}`}</title>
                  <line x1={hub.x} y1={hub.y} x2={p.x} y2={p.y} stroke={color} strokeWidth={1.2} strokeOpacity={0.4} />
                  <circle cx={p.x} cy={p.y} r={it.node.type === "vtuber" ? 6 : 5} fill={color} />
                  <text
                    x={p.x + (right ? 10 : -10)}
                    y={p.y + 4}
                    textAnchor={right ? "start" : "end"}
                    fontSize={14 * k}
                    fill="currentColor"
                    className="hover:underline"
                  >
                    {cut(it.node.label, leafChars)}
                  </text>
                </a>
              );
            })}
            <g>
              <rect x={hub.x - 62 * k} y={hub.y - 15 * k} width={124 * k} height={30 * k} rx={15 * k} fill={color} />
              <text x={hub.x} y={hub.y + 5 * k} textAnchor="middle" fontSize={13 * k} fontWeight={700} fill="#fff">
                {cut(g.label, 9)}
                {g.items.length + g.more > MAX_LEAVES ? ` ${g.items.length + g.more}` : ""}
              </text>
            </g>
          </g>
        );
      })}
      <circle cx={CX} cy={CY} r={58 * k} className="fill-accent" />
      <text x={CX} y={CY + 6 * k} textAnchor="middle" fontSize={17 * k} fontWeight={800} className="fill-accent-fg">
        {centerLines}
      </text>
    </svg>
  );
}

/** 좁은 화면(또는 전체 목록): 묶음별 칩 */
function MapList({ groups }: { groups: MapGroup[] }) {
  return (
    <div className="flex flex-col gap-3">
      {groups.map((g) => (
        <div key={g.key} className="flex flex-col gap-1.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorOf(g.key) }} />
            {g.label}
            {g.more ? <span className="font-normal text-muted-2">+{g.more}</span> : null}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {g.items.map((it) => (
              <Link
                key={it.node.id}
                href={it.node.href}
                prefetch={false}
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-[13px] hover:border-accent/50 hover:text-accent transition-colors"
              >
                {it.node.label}
                {it.weight > 1 ? <span className="ml-1 text-muted-2 tabular-nums">{it.weight}</span> : null}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 관계도 — 넓은 화면은 마인드맵 그림 + 목록, 좁은 화면은 목록 */
export function MindMap({ graph, note = true, narrow }: { graph: EgoGraph; note?: boolean; narrow?: boolean }) {
  if (graph.groups.length === 0) return <p className="text-sm text-muted-2">아직 이어진 관계가 없어요.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="hidden md:block rounded-xl border border-border bg-surface p-2">
        <MapSvg graph={graph} narrow={narrow} />
      </div>
      <MapList groups={graph.groups} />
      {note ? (
        <p className="text-xs text-muted-2">
          ※ 관계는 키리누키 공동 출연·소속사 명단·클립의 게임·사건·이슈 기록으로 버모아가 자동으로 이은 것이에요. 숫자는 함께 나온 클립 수예요.
        </p>
      ) : null}
    </div>
  );
}

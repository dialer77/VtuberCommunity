// 신규 데뷔 웹 수집: Claude(구독, 헤드리스)로 한국 버튜버 데뷔 소식(데뷔 완료 + 예정)을 찾아 저장.
// 채널 주소가 확인되면 버튜버 확정 목록(registry)에 넣어 → 태그가 없어도 버튜버로 인정 + 순위 밖이어도 방송 직접 확인.
import type { SqliteStore, NewDebutReport, DebutSource } from "../store/sqlite";
import type { Platform } from "../domain";
import { runClaudeJson } from "../issues/claude";
import { config } from "../config";
import { log } from "../log";
import { AGENCY_TAGS } from "../vtuber";

interface RawDebut {
  name: string;
  agency?: string;
  channelUrl?: string;
  debutDate: string;
  debutTime?: string;
  status: string;
  summary?: string;
  sources: { url: string; title: string; publisher?: string }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    debuts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "버튜버 활동명 (한국어 표기 우선)" },
          agency: { type: "string", description: "소속사 이름. 개인세면 '개인세'" },
          channelUrl: {
            type: "string",
            description: "주 방송 채널 주소 (치지직 chzzk.naver.com/…, SOOP sooplive.co.kr/station/…, 유튜브 youtube.com/@…). 모르면 빈 문자열",
          },
          debutDate: { type: "string", description: "데뷔(예정)일 YYYY-MM-DD (KST)" },
          debutTime: { type: "string", description: "데뷔 시각 HH:MM (KST). 모르면 빈 문자열" },
          status: { type: "string", enum: ["upcoming", "debuted"] },
          summary: { type: "string", description: "한 문장 소개 (컨셉·기수 등, 출처에 있는 내용만)" },
          sources: {
            type: "array",
            items: {
              type: "object",
              properties: {
                url: { type: "string" },
                title: { type: "string" },
                publisher: { type: "string" },
              },
              required: ["url", "title"],
            },
          },
        },
        required: ["name", "debutDate", "status", "sources"],
      },
    },
  },
  required: ["debuts"],
} as const;

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 채널 주소 → 플랫폼·채널 ID */
export function parseChannelUrl(raw: string | undefined): { platform: Platform; channelId: string; url: string } | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const parts = u.pathname.split("/").filter(Boolean);
  if (host === "chzzk.naver.com") {
    const id = parts[0] === "live" ? parts[1] : parts[0];
    if (id && /^[0-9a-f]{32}$/i.test(id)) {
      return { platform: "chzzk", channelId: id.toLowerCase(), url: `https://chzzk.naver.com/${id.toLowerCase()}` };
    }
    return null;
  }
  if (/(^|\.)sooplive\.co\.kr$|(^|\.)afreecatv\.com$/.test(host)) {
    // sooplive.co.kr/station/<id> · ch.sooplive.co.kr/<id> · play.sooplive.co.kr/<id>/… · bj.afreecatv.com/<id>
    const id = parts[0] === "station" ? parts[1] : parts[0];
    if (id && /^[a-z0-9_]{3,30}$/i.test(id)) {
      return { platform: "soop", channelId: id.toLowerCase(), url: `https://www.sooplive.co.kr/station/${id.toLowerCase()}` };
    }
    return null;
  }
  if (host === "youtube.com") {
    const first = parts[0] ?? "";
    if (first.startsWith("@")) return { platform: "youtube", channelId: first, url: `https://www.youtube.com/${first}` };
    if (first === "channel" && parts[1]?.startsWith("UC")) {
      return { platform: "youtube", channelId: parts[1], url: `https://www.youtube.com/channel/${parts[1]}` };
    }
  }
  return null;
}

function buildPrompt(known: string[], maxItems: number): string {
  return `당신은 한국 버튜버 정보 사이트 "버모아(VMOA)"의 데뷔 담당 에디터다.
오늘(KST): ${kstToday()}

## 할 일
웹 검색(WebSearch)과 페이지 확인(WebFetch)으로 **한국(어) 버튜버의 데뷔 소식**을 가능한 한 많이(최대 ${maxItems}건) 찾는다.
- debuted: 최근 30일 안에 데뷔(첫 방송)한 버튜버
- upcoming: 앞으로 60일 안에 데뷔가 예고된 버튜버
대상: 치지직·SOOP(숲)·유튜브에서 **라이브 방송을 하는** 버튜버 (소속사 기수 데뷔 + 개인세 데뷔 모두).
버추얼 가수·버추얼 아이돌은 방송 활동이 있을 때만 포함.

## 찾는 방법 (중요)
검색은 **최소 8번 이상, 검색어를 바꿔 가며** 한다. 예:
- "버튜버 데뷔", "신인 버튜버 데뷔 방송", "버츄얼 스트리머 데뷔 예정", "버튜버 데뷔 일정 ${kstToday().slice(0, 7)}"
- "치지직 버튜버 데뷔", "숲 버추얼 데뷔", "버튜버 1기생 데뷔", "버튜버 오디션 합격 데뷔", "데뷔 예고 트레일러 버츄얼"
- 소속사별: ${AGENCY_TAGS.slice(0, 12).join(", ")} 등 + "신규 멤버 데뷔" / "기수 데뷔"
소속사 공식 사이트·공식 유튜브·공지, 데뷔 예고 영상, 기사, 버튜버 커뮤니티 정리글을 확인한다.
찾은 것이 3건보다 적으면 검색어를 바꿔 더 찾는다.

## 규칙
- 출처 1~3개 필수. **실제로 열어 본 원문 URL 만** (지어내지 말 것).
- channelUrl 은 그 버튜버의 방송 채널 주소를 확인했을 때만. 확실하지 않으면 빈 문자열.
- 날짜는 KST. 시각을 모르면 debutTime 은 빈 문자열.
- 루머·추측은 제외. 소개(summary)는 출처에 있는 내용만 한 문장.
- 아래 '이미 기록된 데뷔'와 같은 사람은 **날짜가 바뀌었거나 채널 주소를 새로 찾은 경우에만** 다시 넣는다.

## 이미 기록된 데뷔
${known.length ? known.map((k) => `- ${k}`).join("\n") : "- (없음)"}
`;
}

export interface DebutCollectSummary {
  found: number;
  added: string[];
  updated: string[];
  registered: string[];
  skipped: { name: string; reason: string }[];
  durationMs: number;
}

export async function collectDebuts(store: SqliteStore): Promise<DebutCollectSummary> {
  const known = store
    .listDebutReports(true, 80)
    .map((r) => `${r.name}${r.agency ? ` (${r.agency})` : ""} · ${r.debutDate} · ${r.status}${r.channelUrl ? " · 채널 확인됨" : ""}`);
  const max = Math.max(3, config.debutsMaxPerRun);
  log.info(`데뷔 소식 수집 시작 — 최대 ${max}건`);
  const res = await runClaudeJson<{ debuts: RawDebut[] }>(buildPrompt(known, max), SCHEMA, {
    tools: ["WebSearch", "WebFetch"],
  });

  const summary: DebutCollectSummary = {
    found: res.output.debuts?.length ?? 0,
    added: [],
    updated: [],
    registered: [],
    skipped: [],
    durationMs: res.durationMs,
  };
  const today = kstToday();
  for (const d of (res.output.debuts ?? []).slice(0, max)) {
    const name = (d.name ?? "").trim();
    const skip = (reason: string) => summary.skipped.push({ name: name || "(이름 없음)", reason });
    if (!name) { skip("이름 없음"); continue; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.debutDate ?? "")) { skip("날짜 형식"); continue; }
    const sources: DebutSource[] = [];
    for (const s of d.sources ?? []) {
      try {
        const u = new URL(s.url);
        if (u.protocol === "http:" || u.protocol === "https:") {
          sources.push({ url: u.toString(), title: (s.title || u.hostname).trim(), publisher: s.publisher?.trim() || null });
        }
      } catch {
        /* 잘못된 URL */
      }
    }
    if (sources.length === 0) { skip("출처 없음"); continue; }

    const time = /^\d{2}:\d{2}$/.test(d.debutTime ?? "") ? d.debutTime : "00:00";
    const ch = parseChannelUrl(d.channelUrl);
    // 날짜가 오늘 이후면 예정, 지났으면 데뷔 완료로 맞춘다 (모델 표기보다 날짜 우선)
    const status: "upcoming" | "debuted" = d.debutDate > today ? "upcoming" : "debuted";
    const rep: NewDebutReport = {
      name,
      agency: d.agency?.trim() || null,
      platform: ch?.platform ?? null,
      channelId: ch?.channelId ?? null,
      channelUrl: ch?.url ?? null,
      debutAt: new Date(`${d.debutDate}T${time}:00+09:00`).toISOString(),
      debutDate: d.debutDate,
      status,
      summary: d.summary?.trim() || null,
      sources: sources.slice(0, 3),
    };
    const r = store.upsertDebutReport(rep);
    (r === "added" ? summary.added : summary.updated).push(`${name} ${d.debutDate} ${status}`);
    if (ch && (ch.platform === "chzzk" || ch.platform === "soop")) {
      if (store.addRegistry({ platform: ch.platform, channelId: ch.channelId, name }, "web-debut")) {
        summary.registered.push(`${name} (${ch.platform})`);
      }
    }
  }

  log.info(
    `데뷔 소식 수집 완료 — 후보 ${summary.found} · 추가 ${summary.added.length} · 갱신 ${summary.updated.length} · 확정목록 +${summary.registered.length} · ${Math.round(summary.durationMs / 1000)}초`,
  );
  for (const a of summary.added) log.event(`  🎀 ${a}`);
  return summary;
}

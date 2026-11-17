// 버튜버 생일·데뷔일 웹 수집: Claude(구독, 헤드리스, 웹 검색)가 공식 프로필·위키·기사에서 찾는다.
// 대상: 월간 시청시간 상위 N(치지직·SOOP) → 유튜브 전용 버튜버 → 확정 목록. 한 번에 FACTS_BATCH 명, 아직 안 찾았거나 오래된 것만.
// 생일은 캐릭터(활동) 공식 생일의 월·일만 받는다 (실제 생년·나이·실명 같은 사적인 정보는 받지 않음).
import type { SqliteStore } from "../store/sqlite";
import { channelUrl } from "../store/sqlite";
import type { Platform } from "../domain";
import { resolveChannelTags, tagById } from "../tags/catalog";
import { runClaudeJson } from "../issues/claude";
import { validBirthday, validDebutDate, type FactSource } from "./store";
import { config } from "../config";
import { log } from "../log";

export interface FactTarget {
  platform: Platform;
  channelId: string;
  name: string;
  /** 프롬프트에 붙일 힌트 (소속·채널 주소) */
  hint: string;
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 수집 대상 (순서 = 우선순위). 이미 찾았거나 아직 다시 찾을 때가 아닌 것은 뺀다 */
export function factTargets(store: SqliteStore, opts: { all?: boolean } = {}): FactTarget[] {
  const out: FactTarget[] = [];
  const seen = new Set<string>();
  const agencyOf = (channelId: string): string | null => {
    for (const id of resolveChannelTags(channelId, store.lastRawTags(channelId))) {
      const t = tagById(id);
      if (t?.kind === "agency") return t.label;
    }
    return null;
  };
  const add = (platform: Platform, channelId: string, name: string, group: string | null) => {
    const k = `${platform}:${channelId}`;
    if (seen.has(k)) return;
    seen.add(k);
    if (!opts.all && !store.facts.isDue(platform, channelId)) return;
    const where = platform === "chzzk" ? "치지직" : platform === "soop" ? "SOOP" : "유튜브";
    out.push({ platform, channelId, name, hint: `${where} ${channelUrl(platform, channelId)}${group ? ` · 소속 ${group}` : ""}` });
  };
  for (const r of store.getPeriodRanking(30, "watch", config.factsTop).ranking) {
    if (r.platform === "chzzk" || r.platform === "soop") add(r.platform, r.channelId, r.channelName, agencyOf(r.channelId));
  }
  for (const v of store.youtube.listVtubers()) add("youtube", v.ytChannelId, v.name, v.group);
  for (const r of store.listRegistry()) add(r.platform, r.channelId, r.name, agencyOf(r.channelId));
  return out;
}

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "목록 번호" },
          birthday: { type: "string", description: "캐릭터(활동) 공식 생일 MM-DD. 모르면 빈 문자열" },
          debutDate: { type: "string", description: "데뷔일(첫 방송·공식 데뷔) YYYY-MM-DD. 모르면 빈 문자열" },
          sources: {
            type: "array",
            items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" } }, required: ["url"] },
          },
        },
        required: ["n", "birthday", "debutDate", "sources"],
      },
    },
  },
  required: ["items"],
} as const;

function buildPrompt(targets: FactTarget[]): string {
  return `당신은 한국 버튜버 정보 사이트 "버모아(VMOA)"의 자료 담당 에디터다. 오늘(KST): ${kstToday()}

## 할 일
아래 버튜버마다 **생일**과 **데뷔일**을 웹 검색(WebSearch)과 페이지 확인(WebFetch)으로 찾는다.
- birthday: 버튜버(캐릭터·활동)의 공식 생일, 월-일만 (MM-DD). 예: 03-05
- debutDate: 버튜버로 데뷔(첫 방송·공식 데뷔)한 날 (YYYY-MM-DD). 예: 2023-04-01

## 규칙
- 공식 프로필(소속사 사이트·방송국 소개·공식 SNS 프로필·공지), 나무위키 같은 정리 위키, 기사에서 **확인한 것만**. 추측·계산하지 말 것. 모르면 빈 문자열.
- 이름이 같은 다른 사람(다른 스트리머·연예인)과 헷갈리지 않게 플랫폼·채널 주소·소속으로 같은 사람인지 확인한다.
- 버튜버로 활동하기 전의 다른 활동(이전 캐릭터·실사 방송)의 날짜는 데뷔일로 쓰지 않는다. 지금 캐릭터의 데뷔일만.
- 실제 사람의 생년·나이·실명·주소 같은 사적인 정보는 적지 않는다. 생일은 월-일만.
- 찾은 값마다 출처 URL 1~2개 (실제로 연 페이지). 둘 다 모르면 sources 는 빈 배열.
- 한 사람에 오래 매달리지 말고 목록 전체를 고르게 확인한다.

## 목록
${targets.map((t, i) => `${i + 1}. ${t.name} (${t.hint})`).join("\n")}
`;
}

interface RawItem {
  n: number;
  birthday?: string;
  debutDate?: string;
  sources?: { url: string; title?: string }[];
}

export interface FactCollectSummary {
  checked: number;
  birthdays: number;
  debuts: number;
  found: string[];
  durationMs: number;
}

/** 웹 수집 1회 (대상이 없으면 Claude 를 부르지 않음) */
export async function collectFacts(store: SqliteStore, limit = config.factsBatch): Promise<FactCollectSummary> {
  const targets = factTargets(store).slice(0, Math.max(1, limit));
  const summary: FactCollectSummary = { checked: 0, birthdays: 0, debuts: 0, found: [], durationMs: 0 };
  if (targets.length === 0) return summary;
  log.info(`생일·데뷔일 수집 시작 — ${targets.length}명`);
  const res = await runClaudeJson<{ items: RawItem[] }>(buildPrompt(targets), SCHEMA, { tools: ["WebSearch", "WebFetch"] });
  summary.durationMs = res.durationMs;
  const byN = new Map((res.output.items ?? []).map((it) => [it.n, it]));
  const today = kstToday();
  targets.forEach((t, i) => {
    const it = byN.get(i + 1);
    const birthday = validBirthday(it?.birthday?.trim()) ? it!.birthday!.trim() : null;
    const debutDate = validDebutDate(it?.debutDate?.trim(), today) ? it!.debutDate!.trim() : null;
    const sources: FactSource[] = [];
    for (const s of it?.sources ?? []) {
      try {
        const u = new URL(s.url);
        if (u.protocol === "https:" || u.protocol === "http:") sources.push({ url: u.toString(), title: (s.title || u.hostname).trim().slice(0, 120) });
      } catch {
        /* 잘못된 URL */
      }
    }
    // 출처 없는 값은 쓰지 않는다
    const ok = sources.length > 0;
    store.facts.saveAuto({
      platform: t.platform,
      channelId: t.channelId,
      name: t.name,
      birthday: ok ? birthday : null,
      debutDate: ok ? debutDate : null,
      sources: ok ? sources : [],
    });
    summary.checked++;
    if (ok && birthday) summary.birthdays++;
    if (ok && debutDate) summary.debuts++;
    if (ok && (birthday || debutDate)) summary.found.push(`${t.name}${birthday ? ` 🎂${birthday}` : ""}${debutDate ? ` 🌱${debutDate}` : ""}`);
  });
  log.info(
    `생일·데뷔일 수집 완료 — ${summary.checked}명 중 생일 ${summary.birthdays} · 데뷔일 ${summary.debuts} · ${Math.round(summary.durationMs / 1000)}초`,
  );
  return summary;
}

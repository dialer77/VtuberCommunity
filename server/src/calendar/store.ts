// 버튜버 기념일 재료 (SQLite, 수집 DB 와 같은 파일).
//  vtuber_facts  버튜버별 생일(MM-DD)·데뷔일(YYYY-MM-DD) + 출처. Claude 웹 수집(auto) 또는 운영자 입력(manual)
//
// 생일은 캐릭터(활동) 공식 생일의 월·일만 저장한다 (실제 생년·나이 같은 사적인 정보는 받지 않음).
import type { DatabaseSync } from "node:sqlite";
import type { Platform } from "../domain";

export interface FactSource {
  url: string;
  title: string;
}

export interface VtuberFact {
  platform: Platform;
  channelId: string;
  name: string;
  /** MM-DD */
  birthday: string | null;
  /** YYYY-MM-DD (KST) */
  debutDate: string | null;
  sources: FactSource[];
  /** auto = 웹 수집, manual = 운영자 입력 (웹 수집이 덮어쓰지 않음) */
  birthdayManual: boolean;
  debutManual: boolean;
  checkedAt: string;
  updatedAt: string;
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function parseSources(raw: unknown): FactSource[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    return JSON.parse(raw) as FactSource[];
  } catch {
    return [];
  }
}

/** MM-DD 가 실제 있는 날짜인지 (2월 29일 허용) */
export function validBirthday(s: string | null | undefined): s is string {
  const m = /^(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return false;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  const days = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return !!days && d >= 1 && d <= days;
}

/** YYYY-MM-DD 가 실제 날짜이고 2016년(버튜버 시작) ~ 오늘 사이인지 */
export function validDebutDate(s: string | null | undefined, todayKst: string): s is string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s ?? "")) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return false;
  return s! >= "2016-01-01" && s! <= todayKst;
}

export class FactsRepo {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vtuber_facts (
        platform         TEXT NOT NULL,
        channel_id       TEXT NOT NULL,
        name             TEXT NOT NULL,
        birthday         TEXT,
        debut_date       TEXT,
        sources          TEXT NOT NULL DEFAULT '[]',
        birthday_manual  INTEGER NOT NULL DEFAULT 0,
        debut_manual     INTEGER NOT NULL DEFAULT 0,
        checked_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        PRIMARY KEY (platform, channel_id)
      );
    `);
  }

  private toFact(r: Record<string, unknown>): VtuberFact {
    return {
      platform: r.platform as Platform,
      channelId: r.channel_id as string,
      name: r.name as string,
      birthday: str(r.birthday),
      debutDate: str(r.debut_date),
      sources: parseSources(r.sources),
      birthdayManual: Number(r.birthday_manual) === 1,
      debutManual: Number(r.debut_manual) === 1,
      checkedAt: r.checked_at as string,
      updatedAt: r.updated_at as string,
    };
  }

  get(platform: Platform, channelId: string): VtuberFact | null {
    const r = this.db
      .prepare(`SELECT * FROM vtuber_facts WHERE platform = ? AND channel_id = ?`)
      .get(platform, channelId) as Record<string, unknown> | undefined;
    return r ? this.toFact(r) : null;
  }

  /** 생일이나 데뷔일이 하나라도 있는 것 */
  listKnown(): VtuberFact[] {
    const rows = this.db
      .prepare(`SELECT * FROM vtuber_facts WHERE birthday IS NOT NULL OR debut_date IS NOT NULL`)
      .all() as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toFact(r));
  }

  listAll(): VtuberFact[] {
    const rows = this.db.prepare(`SELECT * FROM vtuber_facts ORDER BY updated_at DESC`).all() as unknown as Array<Record<string, unknown>>;
    return rows.map((r) => this.toFact(r));
  }

  counts(): { checked: number; birthday: number; debut: number; manual: number } {
    const r = this.db
      .prepare(`
        SELECT COUNT(*) AS n, COUNT(birthday) AS b, COUNT(debut_date) AS d,
          SUM(CASE WHEN birthday_manual = 1 OR debut_manual = 1 THEN 1 ELSE 0 END) AS m
        FROM vtuber_facts
      `)
      .get() as { n: number; b: number; d: number; m: number | null };
    return { checked: Number(r.n), birthday: Number(r.b), debut: Number(r.d), manual: Number(r.m ?? 0) };
  }

  /**
   * 웹 수집을 할 차례인지: 처음이거나, 둘 다 못 찾고 60일이 지났거나, 하나만 찾고 180일이 지난 것.
   * 운영자가 둘 다 정한 것은 다시 찾지 않는다.
   */
  isDue(platform: Platform, channelId: string, nowMs = Date.now()): boolean {
    const f = this.get(platform, channelId);
    if (!f) return true;
    if ((f.birthday || f.birthdayManual) && (f.debutDate || f.debutManual)) return false;
    const age = nowMs - (Date.parse(f.checkedAt) || 0);
    const DAY = 86_400_000;
    return !f.birthday && !f.debutDate ? age > 60 * DAY : age > 180 * DAY;
  }

  /** 웹 수집 결과 저장. 운영자가 정한 값은 그대로 두고, 찾은 값이 있을 때만 바꾼다 (못 찾았다고 지우지 않음) */
  saveAuto(f: { platform: Platform; channelId: string; name: string; birthday: string | null; debutDate: string | null; sources: FactSource[] }): void {
    const now = new Date().toISOString();
    const cur = this.get(f.platform, f.channelId);
    const birthday = cur?.birthdayManual ? cur.birthday : (f.birthday ?? cur?.birthday ?? null);
    const debutDate = cur?.debutManual ? cur.debutDate : (f.debutDate ?? cur?.debutDate ?? null);
    const sources = f.sources.length ? f.sources : (cur?.sources ?? []);
    const changed = !cur || cur.birthday !== birthday || cur.debutDate !== debutDate;
    this.db
      .prepare(`
        INSERT INTO vtuber_facts (platform, channel_id, name, birthday, debut_date, sources, checked_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, channel_id) DO UPDATE SET
          name = excluded.name, birthday = excluded.birthday, debut_date = excluded.debut_date,
          sources = excluded.sources, checked_at = excluded.checked_at,
          updated_at = CASE WHEN ? THEN excluded.updated_at ELSE updated_at END
      `)
      .run(f.platform, f.channelId, f.name, birthday, debutDate, JSON.stringify(sources.slice(0, 4)), now, now, changed ? 1 : 0);
  }

  /** 운영자 입력: field 값을 정하거나(null = 없음으로 확정) */
  setManual(platform: Platform, channelId: string, name: string, field: "birthday" | "debut", value: string | null): void {
    const now = new Date().toISOString();
    const col = field === "birthday" ? "birthday" : "debut_date";
    const flag = field === "birthday" ? "birthday_manual" : "debut_manual";
    this.db
      .prepare(`
        INSERT INTO vtuber_facts (platform, channel_id, name, ${col}, ${flag}, checked_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(platform, channel_id) DO UPDATE SET name = excluded.name, ${col} = excluded.${col}, ${flag} = 1, updated_at = excluded.updated_at
      `)
      .run(platform, channelId, name, value, now, now);
  }

  /** 운영자 입력 해제 → 운영자가 넣은 값은 지우고 다음 웹 수집 때 다시 찾음 */
  clearManual(platform: Platform, channelId: string): void {
    this.db
      .prepare(`
        UPDATE vtuber_facts SET
          birthday = CASE WHEN birthday_manual = 1 THEN NULL ELSE birthday END,
          debut_date = CASE WHEN debut_manual = 1 THEN NULL ELSE debut_date END,
          birthday_manual = 0, debut_manual = 0, checked_at = '', updated_at = ?
        WHERE platform = ? AND channel_id = ?
      `)
      .run(new Date().toISOString(), platform, channelId);
  }
}

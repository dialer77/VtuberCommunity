import type { Store } from "./types";
import type { LiveSnapshot } from "../domain";

/** DB 없이 돌려보기 위한 인메모리 저장소. 프로세스 종료 시 데이터 소멸. */
export class MemoryStore implements Store {
  private seenChannels = new Set<string>();
  private savedSnapshots = 0;

  async saveSnapshots(snapshots: LiveSnapshot[]): Promise<void> {
    this.savedSnapshots += snapshots.length;
  }

  async markNewChannels(snapshots: LiveSnapshot[]): Promise<LiveSnapshot[]> {
    const fresh: LiveSnapshot[] = [];
    for (const s of snapshots) {
      if (!this.seenChannels.has(s.channelId)) {
        this.seenChannels.add(s.channelId);
        fresh.push(s);
      }
    }
    return fresh;
  }

  get totalSnapshots(): number {
    return this.savedSnapshots;
  }
  get totalChannels(): number {
    return this.seenChannels.size;
  }
}

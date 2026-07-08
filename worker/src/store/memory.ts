import type { Store } from "./types";
import type { LiveSnapshot } from "../domain";

/** DB 없이 골격을 돌려보기 위한 인메모리 저장소. 프로세스 종료 시 데이터 소멸. */
export class MemoryStore implements Store {
  private seenChannels = new Set<string>();
  private savedSnapshots = 0;

  async saveSnapshots(snapshots: LiveSnapshot[]): Promise<void> {
    // 실제 구현에서는 여기서 live_snapshots 테이블에 배치 INSERT.
    this.savedSnapshots += snapshots.length;
  }

  async markChannelsSeen(channelIds: string[]): Promise<string[]> {
    const fresh: string[] = [];
    for (const id of channelIds) {
      if (!this.seenChannels.has(id)) {
        this.seenChannels.add(id);
        fresh.push(id);
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

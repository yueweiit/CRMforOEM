import { Injectable } from "@nestjs/common";

export type CacheKey = {
  scope: string;
  groupName: string;
  batchIndex: number;
  contentHash: string;
  promptVersion: string;
};

export type CacheEntry<T = string> = {
  key: CacheKey;
  result: T;
  createdAt: number;
};

type CallTracker = {
  count: number;
  maxCalls: number;
};

@Injectable()
export class AiSummaryCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly maxEntries: number;
  private readonly callTrackers = new Map<string, CallTracker>();

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  // ── Cache key builder ──

  buildKey(params: CacheKey): string {
    return `${params.scope}::${params.groupName}::${params.batchIndex}::${params.contentHash}::${params.promptVersion}`;
  }

  computeContentHash(content: string): string {
    // Simple DJB2-like hash for stable keying
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
      hash = ((hash << 5) + hash + content.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
  }

  // ── Cache operations ──

  get(key: CacheKey): string | undefined {
    const entry = this.store.get(this.buildKey(key));
    if (!entry) return undefined;
    return entry.result;
  }

  set(key: CacheKey, result: string): void {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest entry
      const oldest = [...this.store.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) this.store.delete(oldest[0]);
    }
    this.store.set(this.buildKey(key), {
      key,
      result,
      createdAt: Date.now()
    });
  }

  has(key: CacheKey): boolean {
    return this.store.has(this.buildKey(key));
  }

  clear(): void {
    this.store.clear();
    this.callTrackers.clear();
  }

  get size(): number {
    return this.store.size;
  }

  // ── Call count control ──

  registerScope(scopeId: string, maxCalls: number): void {
    if (!this.callTrackers.has(scopeId)) {
      this.callTrackers.set(scopeId, { count: 0, maxCalls });
    }
  }

  getMaxCalls(evidenceCount: number, pageCount: number): number {
    // Small: 1-2 calls, Normal: 4-6 calls, Large: 8-10 calls
    if (evidenceCount <= 20 && pageCount <= 3) return 2;
    if (evidenceCount <= 60 && pageCount <= 10) return 6;
    return 10;
  }

  canCall(scopeId: string, maxCalls?: number): boolean {
    let tracker = this.callTrackers.get(scopeId);
    if (!tracker) {
      const limit = maxCalls ?? this.getMaxCalls(50, 10);
      tracker = { count: 0, maxCalls: limit };
      this.callTrackers.set(scopeId, tracker);
    }
    if (maxCalls !== undefined && maxCalls !== tracker.maxCalls) {
      tracker.maxCalls = maxCalls;
    }
    return tracker.count < tracker.maxCalls;
  }

  recordCall(scopeId: string): void {
    let tracker = this.callTrackers.get(scopeId);
    if (!tracker) {
      tracker = { count: 0, maxCalls: this.getMaxCalls(50, 10) };
      this.callTrackers.set(scopeId, tracker);
    }
    tracker.count++;
  }

  getCallCount(scopeId: string): number {
    return this.callTrackers.get(scopeId)?.count ?? 0;
  }

  getCallLimit(scopeId: string): number {
    return this.callTrackers.get(scopeId)?.maxCalls ?? 0;
  }
}

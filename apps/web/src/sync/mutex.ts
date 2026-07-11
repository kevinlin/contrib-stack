const held = new Map<string, true>();

type ConnectionMutex = {
  tryAcquire(connectionId: string): boolean;
  release(connectionId: string): void;
};

export const connectionMutex: ConnectionMutex = {
  tryAcquire(connectionId: string): boolean {
    if (held.has(connectionId)) {
      return false;
    }
    held.set(connectionId, true);
    return true;
  },
  release(connectionId: string): void {
    held.delete(connectionId);
  },
};

export function resetConnectionMutexForTests(): void {
  held.clear();
}

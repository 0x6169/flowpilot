export class EventChannel<T> {
  private queue: T[] = [];
  private waiter: ((value: T) => void) | null = null;

  push(event: T): void {
    if (this.waiter) {
      const resolve = this.waiter;
      this.waiter = null;
      resolve(event);
    } else {
      this.queue.push(event);
    }
  }

  drain(): T[] {
    const events = this.queue;
    this.queue = [];
    return events;
  }

  hasPending(): boolean {
    return this.queue.length > 0;
  }

  waitForEvent(): Promise<T> {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift()!);
    }
    return new Promise<T>((resolve) => {
      this.waiter = resolve;
    });
  }
}

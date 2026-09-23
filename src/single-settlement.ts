export class SingleSettlement<T> {
  private settled = false;
  private readonly callback: (value: T | null) => void;

  constructor(callback: (value: T | null) => void) {
    this.callback = callback;
  }

  settle(value: T | null): boolean {
    if (this.settled) return false;
    this.settled = true;
    this.callback(value);
    return true;
  }
}

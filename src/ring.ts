/**
 * Fixed-capacity circular buffer. O(1) push, zero array spreading, minimal GC.
 * When full, new items overwrite the oldest entry.
 */
export class RingBuffer<T> {
  readonly capacity: number;
  private readonly buf: T[];
  private head = 0;   // next write position
  private _size = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buf = new Array<T>(capacity);
  }

  push(item: T): void {
    this.buf[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  get size(): number {
    return this._size;
  }

  /** Returns a new array with items in chronological order (oldest → newest). */
  toArray(): T[] {
    if (this._size < this.capacity) {
      return this.buf.slice(0, this._size);
    }
    // Buffer is full: oldest item sits at index `head`
    return [...this.buf.slice(this.head), ...this.buf.slice(0, this.head)];
  }

  clear(): void {
    this.head = 0;
    this._size = 0;
  }
}

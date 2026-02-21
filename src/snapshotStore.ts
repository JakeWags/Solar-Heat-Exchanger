/**
 * Struct-of-Arrays snapshot store backed by Float32Arrays.
 *
 * Why SoA?
 *   - LTTB iterates one column at a time → contiguous Float32 reads are
 *     ~4× more cache-friendly than walking an array of objects.
 *   - Float32 halves memory vs Float64 (temp precision to 0.003 °C is fine
 *     for visualisation; time precision to ~1 s is fine at any sim scale).
 *   - `push` is 5 scalar writes with zero heap allocation.
 *   - `clear()` resets the length counter only — no reallocation on reset.
 *
 * Memory grows in CHUNK_SIZE steps to amortise TypedArray copies.
 */

const CHUNK_SIZE = 4_096; // elements added per growth step

export class SnapshotStore {
  private _t:       Float32Array;
  private _T_panel: Float32Array;
  private _T_tank:  Float32Array;
  private _T_out:   Float32Array;
  private _G:       Float32Array;
  private _len = 0;
  private _cap: number;

  constructor(initialCapacity = CHUNK_SIZE) {
    this._cap     = initialCapacity;
    this._t       = new Float32Array(initialCapacity);
    this._T_panel = new Float32Array(initialCapacity);
    this._T_tank  = new Float32Array(initialCapacity);
    this._T_out   = new Float32Array(initialCapacity);
    this._G       = new Float32Array(initialCapacity);
  }

  get length(): number { return this._len; }

  push(t: number, T_panel: number, T_tank: number, T_out: number, G: number): void {
    if (this._len === this._cap) this._grow();
    const i = this._len++;
    this._t[i]       = t;
    this._T_panel[i] = T_panel;
    this._T_tank[i]  = T_tank;
    this._T_out[i]   = T_out;
    this._G[i]       = G;
  }

  /** O(1) views into live data — no copy. */
  get t():       Float32Array { return this._t.subarray(0, this._len); }
  get T_panel(): Float32Array { return this._T_panel.subarray(0, this._len); }
  get T_tank():  Float32Array { return this._T_tank.subarray(0, this._len); }
  get T_out():   Float32Array { return this._T_out.subarray(0, this._len); }
  get G():       Float32Array { return this._G.subarray(0, this._len); }

  /** Last recorded values — O(1). */
  last(): { t: number; T_panel: number; T_tank: number; T_out: number; G: number } {
    const i = this._len - 1;
    return {
      t:       this._t[i],
      T_panel: this._T_panel[i],
      T_tank:  this._T_tank[i],
      T_out:   this._T_out[i],
      G:       this._G[i],
    };
  }

  /** Resets length to zero — O(1). Underlying buffers are reused on next push. */
  clear(): void { this._len = 0; }

  private _grow(): void {
    const newCap = this._cap + CHUNK_SIZE;
    const grow = (old: Float32Array): Float32Array => {
      const next = new Float32Array(newCap);
      next.set(old);
      return next;
    };
    this._t       = grow(this._t);
    this._T_panel = grow(this._T_panel);
    this._T_tank  = grow(this._T_tank);
    this._T_out   = grow(this._T_out);
    this._G       = grow(this._G);
    this._cap     = newCap;
  }
}

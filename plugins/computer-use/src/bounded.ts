export class BoundedMap<K, V> extends Map<K, V> {
  constructor(private readonly max: number) {
    super();
  }

  override set(key: K, value: V): this {
    this.delete(key);
    super.set(key, value);
    for (const oldest of this.keys()) {
      if (this.size <= this.max) break;
      this.delete(oldest);
    }
    return this;
  }
}

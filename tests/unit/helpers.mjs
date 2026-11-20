export function project(overrides = {}) {
  return {
    id: 'song-one', title: 'Study', author: 'kiri', notes: [69, 73, null, 89],
    lengths: [4, 2, 1, 8], intervals: [500, 250, null, null], tempo: 120,
    tempoMap: [{ tick: 8, bpm: 96 }], meter: '4/4', key: 'D',
    performance: [{ velocity: 64 }, { velocity: 100, muted: true }, {}, {}],
    tabDraft: { text: 'A  E\n\nU', title: 'Print title', credit: 'Source', size: '52',
      paperLayouts: { tabs: { objects: [{ type: 'text', text: 'Watermark', opacity: 0.2 }] } } },
    ...overrides
  };
}

export class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

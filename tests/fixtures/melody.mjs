// A format-0 melody at 480 pulses per quarter. A4 lasts one beat,
// a half-beat rest follows, then C5 lasts two beats with a tempo change
// halfway through. These values are independent reference expectations.
export function melodyMIDI() {
  const track = [
    0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, // 120 BPM
    0, 0x90, 69, 100,
    0x83, 0x60, 0x80, 69, 0, // release after 480 ticks
    0x81, 0x70, 0x90, 72, 90, // rest 240 ticks
    0x83, 0x60, 0xff, 0x51, 3, 0x0f, 0x42, 0x40, // 60 BPM
    0x83, 0x60, 0x80, 72, 0,
    0, 0xff, 0x2f, 0,
  ];
  return Buffer.from([
    0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 1, 0xe0,
    0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length,
    ...track,
  ]);
}

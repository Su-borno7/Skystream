'use strict';
/**
 * Version comparison shared by the extension manager and the update checker.
 *
 * Versions observed in the wild are inconsistent: mostly integers ("4"),
 * sometimes semver strings ("1.10.0"). A raw string compare marks "1.10.0"
 * as older than "1.9.0", hiding updates. Compare segment-wise: numerically
 * when both segments are numbers, lexically otherwise; missing segments are 0.
 */
function compareVersions(a, b) {
  const parse = (v) =>
    String(v ?? '')
      .trim()
      .replace(/^v/i, '')
      .split('.')
      .map((seg) => (/^\d+$/.test(seg) ? parseInt(seg, 10) : seg.toLowerCase()));
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = i < pa.length ? pa[i] : 0;
    const y = i < pb.length ? pb[i] : 0;
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y;
    } else if (x !== y) {
      const sx = String(x);
      const sy = String(y);
      return sx < sy ? -1 : 1;
    }
  }
  return 0;
}

module.exports = { compareVersions };

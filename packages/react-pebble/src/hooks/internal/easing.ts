/** Standard easing functions matching Alloy's Timeline API. */
export const Easing = {
  linear: (t: number) => t,
  quadEaseIn: (t: number) => t * t,
  quadEaseOut: (t: number) => t * (2 - t),
  quadEaseInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  cubicEaseIn: (t: number) => t * t * t,
  cubicEaseOut: (t: number) => (--t) * t * t + 1,
  cubicEaseInOut: (t: number) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  sinEaseIn: (t: number) => 1 - Math.cos(t * Math.PI / 2),
  sinEaseOut: (t: number) => Math.sin(t * Math.PI / 2),
  sinEaseInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  expoEaseIn: (t: number) => t === 0 ? 0 : Math.pow(2, 10 * (t - 1)),
  expoEaseOut: (t: number) => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  circEaseIn: (t: number) => 1 - Math.sqrt(1 - t * t),
  circEaseOut: (t: number) => Math.sqrt(1 - (--t) * t),
  bounceEaseOut: (t: number) => {
    if (t < 1 / 2.75) return 7.5625 * t * t;
    if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
    if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
    return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
  },
  bounceEaseIn: (t: number) => 1 - Easing.bounceEaseOut(1 - t),
  elasticEaseOut: (t: number) => {
    if (t === 0 || t === 1) return t;
    return Math.pow(2, -10 * t) * Math.sin((t - 0.075) * (2 * Math.PI) / 0.3) + 1;
  },
  backEaseOut: (t: number) => {
    const s = 1.70158;
    return (--t) * t * ((s + 1) * t + s) + 1;
  },
} as const;

export type EasingFn = (t: number) => number;

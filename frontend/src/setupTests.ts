import "@testing-library/jest-dom/vitest";

HTMLCanvasElement.prototype.getContext = (() => ({
  beginPath: () => undefined,
  clearRect: () => undefined,
  createRadialGradient: () => ({
    addColorStop: () => undefined,
  }),
  fillRect: () => undefined,
  lineTo: () => undefined,
  moveTo: () => undefined,
  stroke: () => undefined,
})) as unknown as typeof HTMLCanvasElement.prototype.getContext;

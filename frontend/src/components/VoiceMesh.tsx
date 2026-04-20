import { useEffect, useRef } from "react";

type Props = {
  intensity: number;
  active: boolean;
};

export function VoiceMesh({ intensity, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    let raf = 0;
    const render = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = canvas.clientWidth * ratio;
      const height = canvas.clientHeight * ratio;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.clearRect(0, 0, width, height);
      context.fillStyle = "#f8faf7";
      context.fillRect(0, 0, width, height);

      const columns = 22;
      const rows = 15;
      const gapX = width / (columns - 1);
      const gapY = height / (rows - 1);
      const pulse = active ? 1 + intensity * 0.018 : 0.8;

      for (let y = 0; y < rows; y += 1) {
        context.beginPath();
        for (let x = 0; x < columns; x += 1) {
          const wave = Math.sin(frame * 0.018 + x * 0.7 + y * 0.28) * 14 * pulse;
          const cross = Math.cos(frame * 0.014 + y * 0.6) * 8 * pulse;
          const px = x * gapX + cross;
          const py = y * gapY + wave;
          if (x === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.strokeStyle = y % 3 === 0 ? "rgba(239, 111, 97, 0.42)" : "rgba(31, 111, 91, 0.22)";
        context.lineWidth = ratio;
        context.stroke();
      }

      for (let x = 0; x < columns; x += 1) {
        context.beginPath();
        for (let y = 0; y < rows; y += 1) {
          const wave = Math.sin(frame * 0.016 + x * 0.5 + y * 0.8) * 10 * pulse;
          const px = x * gapX + wave;
          const py = y * gapY;
          if (y === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        context.strokeStyle = x % 4 === 0 ? "rgba(19, 32, 27, 0.22)" : "rgba(31, 111, 91, 0.14)";
        context.stroke();
      }

      const radius = Math.min(width, height) * (0.18 + intensity * 0.001);
      const gradient = context.createRadialGradient(width * 0.5, height * 0.48, 10, width * 0.5, height * 0.48, radius);
      gradient.addColorStop(0, "rgba(31, 111, 91, 0.34)");
      gradient.addColorStop(0.55, "rgba(239, 111, 97, 0.12)");
      gradient.addColorStop(1, "rgba(248, 250, 247, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      frame += 1;
      raf = window.requestAnimationFrame(render);
    };

    render();
    return () => window.cancelAnimationFrame(raf);
  }, [active, intensity]);

  return (
    <canvas
      ref={canvasRef}
      className="h-[320px] w-full border-y border-line bg-paper md:h-[520px]"
      aria-label="声の強さに合わせて動く面接コーチのメッシュ"
    />
  );
}


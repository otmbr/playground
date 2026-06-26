// A compact oscilloscope that draws the audio time-domain waveform into a
// canvas — the "oscilloscope readout" of the concept, and a live visual of the
// sound the collapse is making.

export class Scope {
  private ctx: CanvasRenderingContext2D;
  private phase = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  /** Skip drawing when the canvas is not visible (e.g. collapsed panel). */
  get visible(): boolean {
    return this.canvas.offsetParent !== null;
  }

  draw(data: Uint8Array, color: string, dt: number): void {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const c = this.ctx;
    c.clearRect(0, 0, w, h);

    // baseline
    c.strokeStyle = "rgba(255,255,255,0.10)";
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, h / 2);
    c.lineTo(w, h / 2);
    c.stroke();

    c.lineWidth = 2;
    c.strokeStyle = color;
    c.shadowBlur = 8;
    c.shadowColor = color;
    c.beginPath();

    if (data.length > 1) {
      const n = data.length;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * w;
        const y = (data[i] / 255) * h;
        i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
    } else {
      // idle: a gentle sine so the readout never looks dead
      this.phase += dt * 2;
      for (let x = 0; x <= w; x += 4) {
        const y = h / 2 + Math.sin(x * 0.05 + this.phase) * h * 0.12;
        x === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
      }
    }
    c.stroke();
    c.shadowBlur = 0;
  }
}

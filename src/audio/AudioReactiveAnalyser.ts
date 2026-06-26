// Samples the master analyser into bass/mids/highs bands for feeding shader
// uniforms (Section 18A.7).

export interface AudioBands {
  bass: number;
  mids: number;
  highs: number;
}

export class AudioReactiveAnalyser {
  private data: Uint8Array;

  constructor(private analyser: AnalyserNode) {
    this.data = new Uint8Array(analyser.frequencyBinCount);
  }

  sample(): AudioBands {
    this.analyser.getByteFrequencyData(this.data as Uint8Array<ArrayBuffer>);
    return {
      bass: this.averageRange(0, 8),
      mids: this.averageRange(8, 64),
      highs: this.averageRange(64, Math.min(180, this.data.length)),
    };
  }

  private averageRange(start: number, end: number): number {
    let sum = 0;
    for (let i = start; i < end; i++) sum += this.data[i];
    return sum / (end - start) / 255;
  }
}

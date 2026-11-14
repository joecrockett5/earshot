import type { Scene } from '@earshot/shared';
import { type Graph, buildGraph, disposeGraph, structureKey, updateGraph } from './graph';

/** Lead time between pressing Play and the first sample, to keep scheduling glitch-free. */
const START_DELAY = 0.06;

/** Live preview: owns the AudioContext and the currently playing graph. */
class Engine {
  private ctx: AudioContext | null = null;
  private graph: Graph | null = null;
  private structure = '';
  /** Context time that corresponds to position 0 of the Sound. */
  private origin = 0;

  private context(): AudioContext {
    this.ctx ??= new AudioContext({ latencyHint: 'interactive' });
    return this.ctx;
  }

  /**
   * Create the context and start loading the browser's HRTF data set ahead of
   * the first Play, so the opening milliseconds are not lost. Call from a
   * user gesture.
   */
  warm(): void {
    if (this.ctx) return;
    const ctx = this.context();
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
  }

  get playing(): boolean {
    return this.graph !== null;
  }

  /** Seconds into the Sound. */
  time(): number {
    if (!this.ctx || !this.graph) return 0;
    return Math.max(0, this.ctx.currentTime - this.origin);
  }

  async play(scene: Scene, buffers: ReadonlyMap<string, AudioBuffer>, from = 0): Promise<void> {
    const ctx = this.context();
    if (ctx.state !== 'running') await ctx.resume();
    this.stop();
    const startTime = ctx.currentTime + START_DELAY;
    this.graph = buildGraph(ctx, scene, buffers, startTime, from);
    this.structure = structureKey(scene, buffers);
    this.origin = startTime - from;
  }

  /** Apply an edited scene to the running graph, rebuilding only if its structure changed. */
  sync(scene: Scene, buffers: ReadonlyMap<string, AudioBuffer>): void {
    if (!this.graph || !this.ctx) return;
    if (structureKey(scene, buffers) === this.structure) {
      updateGraph(this.graph, scene);
      return;
    }
    const from = this.time();
    disposeGraph(this.graph);
    const startTime = this.ctx.currentTime + START_DELAY;
    this.graph = buildGraph(this.ctx, scene, buffers, startTime, from);
    this.structure = structureKey(scene, buffers);
    this.origin = startTime - from;
  }

  stop(): void {
    if (!this.graph) return;
    disposeGraph(this.graph);
    this.graph = null;
  }
}

export const engine = new Engine();

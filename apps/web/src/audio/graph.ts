import {
  REF_DISTANCE,
  type Scene,
  type Source,
  effectiveDistance,
  generateImpulseResponse,
  lowpassCutoff,
  polarToAudio,
  reverbSend,
  reverbWetGain,
  rolloffFactor,
  scheduleSource,
} from '@earshot/shared';

/**
 * The audio graph, shared by live preview and offline export:
 *
 *   clip ─ gain ─ lowpass ─┬─ HRTF panner ────────────────┐
 *                          └─ send ─ convolver ─ wet ─────┴─ master ─ out
 *
 * One chain per source; the convolver (room reverb) is shared.
 */

interface SourceNodes {
  player: AudioBufferSourceNode | null;
  gain: GainNode;
  filter: BiquadFilterNode;
  panner: PannerNode;
  send: GainNode;
}

export interface Graph {
  ctx: BaseAudioContext;
  master: GainNode;
  wet: GainNode;
  sources: Map<string, SourceNodes>;
}

const SMOOTHING_SECONDS = 0.02;

function setParam(param: AudioParam, value: number, smoothFrom: number | null): void {
  if (smoothFrom === null) param.value = value;
  else param.setTargetAtTime(value, smoothFrom, SMOOTHING_SECONDS);
}

/** Put the listener at the origin, facing −Z with +Y up (the Web Audio default, made explicit). */
export function configureListener(ctx: BaseAudioContext): void {
  const listener = ctx.listener;
  if (listener.positionX) {
    listener.positionX.value = 0;
    listener.positionY.value = 0;
    listener.positionZ.value = 0;
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  } else {
    // Firefox still only implements the older setter methods.
    listener.setPosition(0, 0, 0);
    listener.setOrientation(0, 0, -1, 0, 1, 0);
  }
}

const impulseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

function impulseResponse(ctx: BaseAudioContext): AudioBuffer {
  let buffer = impulseCache.get(ctx);
  if (!buffer) {
    const [left, right] = generateImpulseResponse({ sampleRate: ctx.sampleRate });
    buffer = ctx.createBuffer(2, left.length, ctx.sampleRate);
    buffer.copyToChannel(left as Float32Array<ArrayBuffer>, 0);
    buffer.copyToChannel(right as Float32Array<ArrayBuffer>, 1);
    impulseCache.set(ctx, buffer);
  }
  return buffer;
}

function applySource(
  nodes: SourceNodes,
  source: Source,
  settings: Scene['settings'],
  smoothFrom: number | null,
): void {
  const distance = effectiveDistance(source.distance, settings.maxDistance);
  const position = polarToAudio({ angle: source.angle, distance });
  const { panner } = nodes;
  panner.panningModel = settings.panningModel;
  panner.distanceModel = settings.distanceModel;
  panner.refDistance = REF_DISTANCE;
  panner.maxDistance = Math.max(settings.maxDistance, REF_DISTANCE * 2);
  panner.rolloffFactor = rolloffFactor(settings.distanceModel);
  setParam(panner.positionX, position.x, smoothFrom);
  setParam(panner.positionY, position.y, smoothFrom);
  setParam(panner.positionZ, position.z, smoothFrom);
  setParam(nodes.gain.gain, source.gain, smoothFrom);
  setParam(
    nodes.filter.frequency,
    Math.min(lowpassCutoff(distance), panner.context.sampleRate / 2),
    smoothFrom,
  );
  setParam(nodes.send.gain, reverbSend(distance), smoothFrom);
}

/**
 * Build the graph for a scene and schedule its clips.
 *
 * @param startTime context time at which playback begins
 * @param from      position within the Sound, in seconds, to begin from
 */
export function buildGraph(
  ctx: BaseAudioContext,
  scene: Scene,
  buffers: ReadonlyMap<string, AudioBuffer>,
  startTime: number,
  from: number,
): Graph {
  configureListener(ctx);

  const master = ctx.createGain();
  master.connect(ctx.destination);

  const convolver = ctx.createConvolver();
  convolver.buffer = impulseResponse(ctx);
  const wet = ctx.createGain();
  wet.gain.value = reverbWetGain(scene.settings.reverb);
  convolver.connect(wet).connect(master);

  const sources = new Map<string, SourceNodes>();
  for (const source of scene.sources) {
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = Math.SQRT1_2;
    const panner = ctx.createPanner();
    const send = ctx.createGain();
    gain.connect(filter);
    filter.connect(panner).connect(master);
    filter.connect(send).connect(convolver);

    const nodes: SourceNodes = { player: null, gain, filter, panner, send };
    applySource(nodes, source, scene.settings, null);

    const buffer = buffers.get(source.clipId);
    const schedule = scheduleSource({ ...source, duration: buffer?.duration ?? 0 }, from);
    if (buffer && schedule) {
      const player = ctx.createBufferSource();
      player.buffer = buffer;
      player.loop = source.loop;
      player.connect(gain);
      player.start(startTime + schedule.delay, schedule.offset);
      nodes.player = player;
    }
    sources.set(source.id, nodes);
  }
  return { ctx, master, wet, sources };
}

/** Push position, gain and settings changes into a running graph without restarting it. */
export function updateGraph(graph: Graph, scene: Scene): void {
  const now = graph.ctx.currentTime;
  setParam(graph.wet.gain, reverbWetGain(scene.settings.reverb), now);
  for (const source of scene.sources) {
    const nodes = graph.sources.get(source.id);
    if (nodes) applySource(nodes, source, scene.settings, now);
  }
}

export function disposeGraph(graph: Graph): void {
  for (const nodes of graph.sources.values()) {
    try {
      nodes.player?.stop();
    } catch {
      // Already stopped.
    }
    nodes.player?.disconnect();
  }
  graph.master.disconnect();
}

/**
 * The parts of a scene that cannot be changed on a running graph. When this
 * string changes, playback has to be rebuilt from the current position.
 */
export function structureKey(scene: Scene, buffers: ReadonlyMap<string, AudioBuffer>): string {
  return scene.sources
    .map((s) => [s.id, s.clipId, s.startOffset, s.loop, buffers.has(s.clipId)].join(':'))
    .join('|');
}

import {
  type Polar,
  type Source,
  clampDistance,
  describeDirection,
  polarToRadar,
  radarToPolar,
  snapAngle,
} from '@earshot/shared';
import {
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import { formatAngle, formatDistance, formatNumber } from '../lib/format';
import { addFiles, loadDemo, moveSource, select } from '../state/actions';
import { useStore } from '../state/store';

/** Space around the outer ring for tick marks and cardinal labels. */
const MARGIN = 58;
/** Below this radius the inner ring labels would crowd each other, so only the outer one shows. */
const COMPACT_RADIUS = 150;
const RINGS = [0.25, 0.5, 0.75, 1];
const TICKS = Array.from({ length: 24 }, (_, i) => i * 15);
const NUDGE_DEGREES = 5;

const CARDINALS = [
  { label: 'Front', angle: 0 },
  { label: 'Right', angle: 90 },
  { label: 'Behind', angle: 180 },
  { label: 'Left', angle: 270 },
];

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

function describe(source: Source): string {
  return `${source.label}: ${formatAngle(source.angle)}, ${describeDirection(source.angle)}, ${formatDistance(source.distance)} away`;
}

export function Radar() {
  const scene = useStore((s) => s.scene);
  const selectedId = useStore((s) => s.selectedId);
  const soundingIds = useStore((s) => s.soundingIds);
  const busy = useStore((s) => s.busy);

  const frameRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const grab = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [size, setSize] = useState(0);
  const [dropAt, setDropAt] = useState<Polar | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize(Math.max(0, Math.floor(Math.min(width, height))));
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  if (!scene) return <div className="radar" ref={frameRef} />;

  const { maxDistance, snapAngle: snapStep } = scene.settings;
  const centre = size / 2;
  const radius = Math.max(40, centre - (size < 420 ? 44 : MARGIN));

  /** Screen position → polar position, optionally snapping the angle. */
  const locate = (clientX: number, clientY: number, snap: boolean): Polar => {
    const rect = svgRef.current?.getBoundingClientRect();
    const x = (clientX - (rect?.left ?? 0) - centre) / radius;
    const y = (clientY - (rect?.top ?? 0) - centre) / radius;
    const polar = radarToPolar({ x, y }, maxDistance);
    return {
      angle: snap ? snapAngle(polar.angle, snapStep) : polar.angle,
      distance: clampDistance(polar.distance, maxDistance),
    };
  };

  const place = (polar: Polar) => {
    const point = polarToRadar(polar, maxDistance);
    return { x: centre + point.x * radius, y: centre + point.y * radius };
  };

  /* ---- dragging dots --------------------------------------------------- */

  const onDotPointerDown = (event: PointerEvent<SVGGElement>, source: Source) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    select(source.id);
    const at = place(source);
    const rect = svgRef.current?.getBoundingClientRect();
    // Remember where inside the dot it was grabbed so it does not jump to the pointer.
    grab.current = {
      id: source.id,
      dx: event.clientX - (rect?.left ?? 0) - at.x,
      dy: event.clientY - (rect?.top ?? 0) - at.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onDotPointerMove = (event: PointerEvent<SVGGElement>) => {
    const held = grab.current;
    if (!held) return;
    moveSource(held.id, locate(event.clientX - held.dx, event.clientY - held.dy, event.shiftKey));
  };

  const onDotPointerUp = (event: PointerEvent<SVGGElement>) => {
    grab.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onDotKeyDown = (event: KeyboardEvent<SVGGElement>, source: Source) => {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
    if (!forward && !backward) return;
    event.preventDefault();
    const sign = forward ? 1 : -1;
    if (event.shiftKey) {
      moveSource(source.id, { ...source, distance: source.distance + sign * (maxDistance / 40) });
    } else {
      moveSource(source.id, { ...source, angle: source.angle + sign * NUDGE_DEGREES });
    }
  };

  /* ---- dropping files -------------------------------------------------- */

  const onDragOver = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDropAt(locate(event.clientX, event.clientY, event.shiftKey));
  };

  const onDrop = (event: DragEvent) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    setDropAt(null);
    const at = locate(event.clientX, event.clientY, event.shiftKey);
    void addFiles(Array.from(event.dataTransfer.files), at);
  };

  const selected = scene.sources.find((source) => source.id === selectedId);
  const selectedAt = selected ? place(selected) : null;
  const ghost = dropAt ? place(dropAt) : null;
  const empty = scene.sources.length === 0;

  return (
    <div
      className={`radar${dropAt ? ' radar--drop' : ''}`}
      ref={frameRef}
      data-testid="radar"
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropAt(null);
      }}
      onDrop={onDrop}
    >
      {size > 0 && (
        <svg
          ref={svgRef}
          className="radar__svg"
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="group"
          aria-label="Radar. The listener is at the centre, facing up."
          onPointerDown={() => select(null)}
        >
          <defs>
            <radialGradient id="radar-fill">
              <stop offset="0%" stopColor="var(--radar-glow)" />
              <stop offset="100%" stopColor="var(--radar-fill)" />
            </radialGradient>
          </defs>

          <circle
            className="radar__disc"
            cx={centre}
            cy={centre}
            r={radius}
            fill="url(#radar-fill)"
          />

          <g className="radar__grid" aria-hidden="true">
            <line x1={centre} y1={centre - radius} x2={centre} y2={centre + radius} />
            <line x1={centre - radius} y1={centre} x2={centre + radius} y2={centre} />
            {RINGS.map((ring) => (
              <circle
                key={ring}
                className={ring === 1 ? 'radar__ring radar__ring--outer' : 'radar__ring'}
                cx={centre}
                cy={centre}
                r={radius * ring}
              />
            ))}
            {RINGS.filter((ring) => ring === 1 || radius >= COMPACT_RADIUS).map((ring) => (
              <text
                key={ring}
                className="radar__ring-label"
                x={centre + radius * ring - 5}
                y={centre - 6}
              >
                {formatNumber(maxDistance * ring, 2)} m
              </text>
            ))}
            {TICKS.map((angle) => {
              const length = angle % 90 === 0 ? 10 : angle % 45 === 0 ? 7 : 4;
              return (
                <line
                  key={angle}
                  className={angle % 45 === 0 ? 'radar__tick radar__tick--major' : 'radar__tick'}
                  x1={centre}
                  y1={centre - radius - 6}
                  x2={centre}
                  y2={centre - radius - 6 - length}
                  transform={`rotate(${angle} ${centre} ${centre})`}
                />
              );
            })}
            {CARDINALS.map(({ label, angle }) => {
              const offset = radius + 32;
              const point = polarToRadar({ angle, distance: 1 }, 1);
              const x = centre + point.x * offset;
              const y = centre + point.y * offset;
              // Side labels run along the ring so they need no horizontal room.
              const turn = angle === 90 ? 90 : angle === 270 ? -90 : 0;
              return (
                <text
                  key={label}
                  className="radar__cardinal"
                  x={x}
                  y={y}
                  transform={turn ? `rotate(${turn} ${x} ${y})` : undefined}
                >
                  {label}
                </text>
              );
            })}
          </g>

          {selectedAt && (
            <line
              className="radar__spoke"
              x1={centre}
              y1={centre}
              x2={selectedAt.x}
              y2={selectedAt.y}
              aria-hidden="true"
            />
          )}

          <g
            className="radar__head"
            transform={`translate(${centre} ${centre})`}
            aria-hidden="true"
          >
            <path
              className="radar__ear"
              d="M-13.5 -3.5a2.5 4 0 0 0 0 8M13.5 -3.5a2.5 4 0 0 1 0 8"
            />
            <circle r="12" />
            <path className="radar__nose" d="M-4.2 -11.2L0 -18.5L4.2 -11.2" />
          </g>

          {scene.sources.map((source) => {
            const at = place(source);
            const isSelected = source.id === selectedId;
            const classes = [
              'dot',
              isSelected && 'dot--selected',
              soundingIds.includes(source.id) && 'dot--sounding',
            ];
            return (
              <g
                key={source.id}
                className={classes.filter(Boolean).join(' ')}
                transform={`translate(${at.x} ${at.y})`}
                tabIndex={0}
                role="button"
                aria-label={describe(source)}
                aria-pressed={isSelected}
                data-testid="source-dot"
                data-angle={source.angle.toFixed(2)}
                data-distance={source.distance.toFixed(3)}
                onPointerDown={(event) => onDotPointerDown(event, source)}
                onPointerMove={onDotPointerMove}
                onPointerUp={onDotPointerUp}
                onPointerCancel={onDotPointerUp}
                onFocus={() => select(source.id)}
                onKeyDown={(event) => onDotKeyDown(event, source)}
              >
                <circle className="dot__pulse" r="8" />
                <circle className="dot__hit" r="18" />
                <circle className="dot__halo" r="13" />
                <circle className="dot__core" r="6.5" />
                <text className="dot__label" y="25">
                  {source.label}
                </text>
              </g>
            );
          })}

          {ghost && dropAt && (
            <g
              className="radar__ghost"
              transform={`translate(${ghost.x} ${ghost.y})`}
              aria-hidden="true"
            >
              <circle r="13" />
              <circle className="radar__ghost-core" r="4" />
              <text y="-22">
                {formatAngle(dropAt.angle)} · {formatDistance(dropAt.distance)}
              </text>
            </g>
          )}
        </svg>
      )}

      {empty && !dropAt && size > 0 && (
        <div className="empty">
          <p className="empty__title">Drop a sound anywhere around the listener</p>
          <p className="empty__sub">wav · mp3 · ogg · flac · m4a</p>
          <div className="empty__actions">
            <button
              className="button button--accent"
              disabled={busy !== null}
              onClick={() => void loadDemo()}
            >
              {busy === 'demo' ? 'Loading demo…' : 'Load demo'}
            </button>
            <button
              className="button"
              disabled={busy !== null}
              onClick={() => fileRef.current?.click()}
            >
              Choose files
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.wav,.mp3,.ogg,.flac,.m4a"
            multiple
            hidden
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
        </div>
      )}
    </div>
  );
}

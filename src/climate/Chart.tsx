import { useMemo, useRef, useState } from 'react';
import type { Climatology, Mapping } from './mapping';
import { formatDoy, MONTHS } from './mapping';

const COLORS = {
  baseline: '#3987e5',
  current: '#d95926',
  grid: 'rgba(255,255,255,0.08)',
  axis: 'rgba(255,255,255,0.35)',
  text: '#c3c2b7',
};

const W = 800;
const H = 360;
const PAD = { top: 20, right: 20, bottom: 36, left: 44 };
const N = 365;
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];

type Props = { city: Climatology; mapping: Mapping };

export default function Chart({ city, mapping }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const { yMin, yMax } = useMemo(() => {
    const all = [...city.baseline, ...city.current];
    const lo = Math.floor(Math.min(...all) / 5) * 5 - 2;
    const hi = Math.ceil(Math.max(...all) / 5) * 5 + 2;
    return { yMin: lo, yMax: hi };
  }, [city]);

  const x = (d: number) => PAD.left + (d / (N - 1)) * (W - PAD.left - PAD.right);
  const y = (t: number) =>
    PAD.top + (1 - (t - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  const path = (s: number[]) =>
    s.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(t).toFixed(1)}`).join(' ');

  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = yMax - yMin > 30 ? 10 : 5;
    for (let t = Math.ceil(yMin / step) * step; t <= yMax; t += step) ticks.push(t);
    return ticks;
  }, [yMin, yMax]);

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const d = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (N - 1));
    setHover(d < 0 || d >= N ? null : d);
  };

  const bx = x(mapping.doy);
  const by = y(mapping.target);
  const mx = mapping.mapped === null ? null : x(mapping.mapped);

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full select-none"
        role="img"
        aria-label={`Daily mean temperature through the year in ${city.name}: pre-industrial baseline versus today.`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        {/* grid */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={COLORS.grid} />
            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={COLORS.text}>
              {t}°
            </text>
          </g>
        ))}
        {MONTH_STARTS.map((d, i) => (
          <text
            key={d}
            x={x(d + 15)}
            y={H - PAD.bottom + 18}
            textAnchor="middle"
            fontSize="11"
            fill={COLORS.text}
          >
            {MONTHS[i].slice(0, 3)}
          </text>
        ))}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={H - PAD.bottom}
          y2={H - PAD.bottom}
          stroke={COLORS.axis}
        />

        {/* target temperature guide */}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={by}
          y2={by}
          stroke="rgba(255,255,255,0.4)"
          strokeDasharray="4 4"
        />

        {/* series */}
        <path d={path(city.baseline)} fill="none" stroke={COLORS.baseline} strokeWidth={2} />
        <path d={path(city.current)} fill="none" stroke={COLORS.current} strokeWidth={2} />

        {/* shift arrow */}
        {mx !== null && (
          <line
            x1={bx}
            x2={mx}
            y1={by}
            y2={by}
            stroke="#fff"
            strokeWidth={2}
            markerEnd="url(#arrow)"
          />
        )}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="#fff" />
          </marker>
        </defs>

        {/* markers: 2px surface ring */}
        <circle cx={bx} cy={by} r={6} fill={COLORS.baseline} stroke="#000" strokeWidth={2} />
        {mx !== null && (
          <circle cx={mx} cy={by} r={6} fill={COLORS.current} stroke="#000" strokeWidth={2} />
        )}

        {/* crosshair */}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={H - PAD.bottom} stroke={COLORS.axis} />
            <circle cx={x(hover)} cy={y(city.baseline[hover])} r={4} fill={COLORS.baseline} stroke="#000" strokeWidth={2} />
            <circle cx={x(hover)} cy={y(city.current[hover])} r={4} fill={COLORS.current} stroke="#000" strokeWidth={2} />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 rounded border border-white/15 bg-black/90 px-3 py-2 text-xs"
          style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > 250 ? 'translateX(-110%)' : 'translateX(12px)' }}
        >
          <div className="mb-1 text-white/60">{formatDoy(hover)}</div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.baseline }} />
            pre-industrial <span className="ml-auto font-mono">{city.baseline[hover].toFixed(1)}°</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.current }} />
            today <span className="ml-auto pl-4 font-mono">{city.current[hover].toFixed(1)}°</span>
          </div>
        </div>
      )}

      <div className="mt-2 flex gap-5 text-xs text-muted">
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5" style={{ background: COLORS.baseline }} /> pre-industrial
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5" style={{ background: COLORS.current }} /> today
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block h-0.5 w-5 border-t border-dashed border-white/40" /> your birthday's temperature
        </span>
      </div>
    </div>
  );
}

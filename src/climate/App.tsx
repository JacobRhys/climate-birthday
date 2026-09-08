import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chart from './Chart';
import Globe, { shiftColor } from './Globe';
import {
  climateBirthday,
  daysInMonth,
  formatDoy,
  MONTHS,
  toDoy,
  yearSummary,
  type Climatology,
} from './mapping';

type Dataset = {
  meta: {
    source: string;
    built: string;
    baseline_years: [number, number];
    current_years: [number, number];
    preindustrial_shift_c: number;
  };
  cities: Climatology[];
};

const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`;

const selectCls =
  'rounded border border-white/30 bg-black px-3 py-2 text-base normal-case tracking-normal text-fg';

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth());
  const [day, setDay] = useState(today.getDate());
  const [picking, setPicking] = useState(true);
  const [cityId, setCityId] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/climate/cities.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status} ${r.statusText}`))))
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const doy = toDoy(month, Math.min(day, daysInMonth(month)));

  const markers = useMemo(
    () => (data ? data.cities.map((city) => ({ city, mapping: climateBirthday(city, doy) })) : []),
    [data, doy],
  );
  const selected = markers.find((m) => m.city.id === cityId) ?? null;
  const summary = useMemo(() => (selected ? yearSummary(selected.city) : null), [selected]);

  const onSelect = useCallback((id: string) => setCityId(id), []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-bg">
      <div className="absolute inset-0">
        <Globe markers={markers} selectedId={cityId} onSelect={onSelect} anchorRef={cardRef} />
      </div>

      {/* Header */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 md:left-8 md:top-8">
        <a href="https://jacob-davies.com/" className="pointer-events-auto inline-flex h-[1.875rem] items-center text-xs uppercase tracking-[0.3em] text-muted transition hover:text-fg">
          ← Jacob Davies
        </a>
        <h1 className="mt-3 font-display text-3xl leading-none md:text-5xl">Climate Birthday</h1>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="pointer-events-auto mt-3 rounded-full border border-white/50 px-4 py-1.5 text-xs uppercase tracking-widest transition hover:bg-white hover:text-bg"
        >
          The {formatDoy(doy)} · change
        </button>
      </div>

      <a
        href="https://jacob-davies.com/blog/climate-birthday/"
        className="absolute right-5 top-5 z-10 rounded-full border border-white/50 px-4 py-1.5 text-xs uppercase tracking-widest transition hover:bg-white hover:text-bg md:right-8 md:top-8"
      >
        Read blog
      </a>

      {error && (
        <p className="absolute inset-x-5 top-40 z-10 rounded border border-red-500/40 bg-red-500/10 p-4 text-sm md:max-w-md">
          Could not load climate data: {error}. Run <code>python3 data/climate_birthday/build.py</code>.
        </p>
      )}

      <p className="pointer-events-none absolute bottom-4 left-5 z-10 text-[10px] uppercase tracking-widest text-white/40 md:left-8">
        drag to rotate · scroll to zoom · click a city
      </p>

      {/* Readout card. The globe draws a line from the selected city to this element. */}
      {selected && summary && data && (
        <div
          ref={cardRef}
          className="absolute inset-x-3 bottom-3 z-20 max-h-[62vh] overflow-y-auto rounded-lg border border-white/20 bg-black/90 p-5 backdrop-blur-sm md:inset-x-auto md:bottom-auto md:right-8 md:top-1/2 md:w-[420px] md:max-h-[86vh] md:-translate-y-1/2 xl:w-[480px]"
        >
          <div className="mb-3 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-muted">
            <span>
              {selected.city.name}, {selected.city.country}
            </span>
            <button
              type="button"
              onClick={() => setCityId(null)}
              aria-label="Close"
              className="ml-auto rounded-full border border-white/30 px-2 py-0.5 text-xs text-white/70 hover:border-white hover:text-fg"
            >
              ✕
            </button>
          </div>

          <section className="mb-6">
            {selected.mapping.extinct ? (
              <>
                <p className="font-display text-2xl leading-tight md:text-3xl">
                  The {formatDoy(doy)}'s weather <span className="text-[#ff5a5a]">no longer happens</span> in{' '}
                  {selected.city.name}.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Before industrialisation, the {formatDoy(doy)} averaged{' '}
                  <strong>{selected.mapping.target.toFixed(1)} °C</strong>. That is{' '}
                  {selected.mapping.extinct === 'cold' ? 'colder' : 'hotter'} than any day of the year in{' '}
                  {selected.city.name} today (
                  {selected.mapping.extinct === 'cold' ? 'coldest' : 'hottest'} day now:{' '}
                  {(selected.mapping.extinct === 'cold'
                    ? Math.min(...selected.city.current)
                    : Math.max(...selected.city.current)
                  ).toFixed(1)}{' '}
                  °C).
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-2xl leading-tight md:text-3xl">
                  In {selected.city.name},{' '}
                  <span style={{ color: shiftColor(selected.mapping.shiftDays ?? 0) }}>
                    the {formatDoy(selected.mapping.mapped!)}
                  </span>{' '}
                  now feels like the{' '}
                  {formatDoy(doy)} used to.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-white/70">
                  Your climate birthday is <strong>the {formatDoy(selected.mapping.mapped!)}</strong>,{' '}
                  {Math.abs(Math.round(selected.mapping.shiftDays!))} days{' '}
                  {selected.mapping.shiftDays! < 0 ? 'earlier' : 'later'} in the year. Pre-industrial{' '}
                  the {formatDoy(doy)} averaged {selected.mapping.target.toFixed(1)} °C; today it averages{' '}
                  {selected.city.current[doy].toFixed(1)} °C ({signed(selected.mapping.warming)} °C).
                  {selected.mapping.phaseFallback &&
                    ' (No same-season match existed; nearest match in the opposite season shown.)'}
                </p>
              </>
            )}
            {selected.mapping.novel && (
              <p className="mt-3 text-sm text-[#d95926]">
                Today's {formatDoy(doy)} ({selected.city.current[doy].toFixed(1)} °C) is{' '}
                {selected.mapping.novel === 'hot' ? 'hotter' : 'colder'} than any day of the pre-industrial year in{' '}
                {selected.city.name}. This weather never used to exist here.
              </p>
            )}
            {selected.mapping.warming < 0 && (
              <p className="mt-3 text-xs leading-relaxed text-white/50">
                ERA5 shows this date slightly cooler in {selected.city.name} than in 1951–80. Parts of South Asia
                really have cooled at the surface (irrigation, aerosols), but treat this readout with caution.
              </p>
            )}
          </section>

          <section className="mb-6">
            <Chart city={selected.city} mapping={selected.mapping} />
          </section>

          <section className="mb-5 grid grid-cols-3 gap-2">
            <Stat label="Avg warming" value={`${signed(summary.meanWarming)} °C`} />
            <Stat label="Days gone" value={`${summary.extinctDays}`} />
            <Stat label="Days new" value={`${summary.novelDays}`} />
          </section>

        </div>
      )}

      {/* Birthday picker */}
      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="picker-title"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPicking(false);
            }}
            className="w-full max-w-md rounded-lg border border-white/20 bg-black p-8"
          >
            <div className="text-xs uppercase tracking-[0.3em] text-muted">Climate Birthday</div>
            <h2 id="picker-title" className="mt-2 font-display text-3xl leading-tight md:text-4xl">
              When is your birthday?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              We'll find the day of the year that now has the weather your birthday had before industrialisation,
              in cities across the world.
            </p>
            <div className="mt-6 flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-xs uppercase tracking-widest text-muted">
                Day
                <select
                  autoFocus
                  value={Math.min(day, daysInMonth(month))}
                  onChange={(e) => setDay(Number(e.target.value))}
                  className={selectCls}
                >
                  {Array.from({ length: daysInMonth(month) }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-[2] flex-col gap-1 text-xs uppercase tracking-widest text-muted">
                Month
                <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={selectCls}>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              type="submit"
              className="mt-6 w-full rounded-full border border-white bg-white px-5 py-3 text-xs uppercase tracking-widest text-bg transition hover:bg-black hover:text-fg"
            >
              Show my climate birthday
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/15 px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-0.5 font-display text-xl">{value}</div>
    </div>
  );
}

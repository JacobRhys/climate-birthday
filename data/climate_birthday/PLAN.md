# Climate Birthday - data plan

Goal: for a city + date, find the day of the year that *now* has the weather that
date had *before industrialisation*. Per city. Nearest same-season day. Flag days
whose weather no longer exists, and days whose weather never used to.

## 1. Collect

| Need | Source | Why |
|---|---|---|
| Daily temperature, any city, 1940 → today | **ERA5 via Open-Meteo archive API** (`archive-api.open-meteo.com`, free, no key) | One HTTP call per city per window. What `build.py` uses now. |
| True pre-industrial (1850–1900) | **Berkeley Earth** daily gridded (1880+) or **20CRv3** reanalysis (1836–2015) | ERA5 starts 1940. Current build uses 1951–80 shifted −0.3 °C (global warming 1850–1900 → 1951–80) as a stand-in. 1940s excluded: ERA5 back-extension is obs-sparse and warm-biased regionally. Upgrade path: swap `climatology()` input, same output format. |
| Any city, not a fixed list | Open-Meteo geocoding API → lat/lon → same pipeline | v2: geocode on demand, cache per grid cell (0.25°). |
| Extra variables (later) | Same API: `temperature_2m_max/min`, `precipitation_sum`, `relative_humidity_2m_mean` | Only if mapping becomes multivariate (see §2). |

Free-tier gotchas: long daily requests are weighted heavily → 429s. `build.py`
fetches the two windows separately, backs off 60 s on 429, caches raw responses
in `cache/` (git-ignored) so reruns are free.

## 2. Process (`build.py`)

1. Windows: **baseline** 1951–1980 (+ shift), **current** 2006–2025. Both ≥ 20 y so
   single hot/cold years wash out.
2. Fold 29 Feb onto 28 Feb → 365-slot year.
3. Fit each window with a **3-harmonic Fourier series** (annual + 2 overtones) by
   least squares on the raw daily samples. This is the important step: the
   mapping *inverts* the current curve, and a noisy day-of-year mean has dozens
   of spurious crossings. 3 harmonics captures asymmetric seasons (slow spring,
   fast autumn) without ripples.
4. Emit `public/climate/cities.json` - ~3 kB per city (2 × 365 numbers). Ships
   with the site; no backend.

Variable choice: daily **mean** 2 m temperature. It is what "same weather"
means to most people and it is monotonic within each half-year, which makes
the inversion well-defined. Precip/humidity are not monotonic through the
year so they cannot define a single "birthday"; if wanted, show them as
secondary facts about the mapped day rather than folding them into the
distance metric.

## 3. Map (`src/climate/mapping.ts`, runs in browser)

Input day `d0`, target `T = B[d0]`.

1. Find every fractional day where the current curve `C` crosses `T`
   (linear interpolation between the 365 slots).
2. Keep crossings with the **same phase** as `d0` (sign of dB/dd: rising = spring
   half, falling = autumn half). This is what sends 2 April to February, not
   October.
3. Of those, take the **nearest by circular day distance**. If no same-phase
   crossing exists (only happens right at the solstice peaks), fall back to any
   crossing and say so.
4. `T < min(C)` → **extinct** ("this weather no longer happens here"): report
   the coldest day now and the gap. `T > max(C)` is the hot mirror (rare).
5. `C[d0] > max(B)` → **novel** ("today's weather on this date never used to
   exist here").
6. Whole-year summary: count of extinct days, novel days, mean warming.

## 4. Present (`/climate-birthday/`)

- Entry: modal asks for birthday (day, month). Recomputes for every city instantly
  (pure function, no fetch).
- Globe (three.js, `Globe.tsx`): one dot per city, labelled with its climate
  birthday; **flashing red dot** where that weather no longer occurs. Click a dot
  (or a chip / dropdown) → camera eases round to it, readout panel fills in.
- **Headline sentence**, not a number: "In London, 2 April now feels like
  17 February used to." Days earlier/later + °C delta underneath.
- **One chart**: both annual curves, dashed line at the target temperature,
  arrow from the birthday on the blue curve to the mapped day on the orange
  curve. Hover crosshair with both values. Legend + direct labels.
- Three stat tiles for the city as a whole (warming, extinct days, novel days).
- Data table toggle (accessibility / scrutiny). Method footer with windows,
  source, shift, build date.

## 5. Next

- Real pre-industrial baseline (Berkeley Earth) instead of the −0.3 °C shift.
- Geocoded free-text city input with on-demand fetch + cache.
- Shareable URL (`?city=london&d=2&m=4`) and OG image.
- Second mode: "birth year → today" (personal lifetime drift) using the year of
  birth as the baseline window - the original project idea, same machinery.

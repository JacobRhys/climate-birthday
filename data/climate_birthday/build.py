"""
Climate Birthday - data build.

For each city:
  1. Fetch daily 2 m mean temperature (ERA5 via Open-Meteo archive, 1940 → today).
  2. Split into a BASELINE window and a CURRENT window.
  3. For each window, average by day-of-year, then smooth with a low-order
     Fourier fit (annual cycle + 2 harmonics). Smoothing matters: the mapping
     inverts the current curve, and a noisy curve has many spurious crossings.
  4. Write public/climate/cities.json - small enough to ship with the site;
     the mapping itself runs in the browser (src/climate/mapping.ts).

Baseline caveat: ERA5 starts in 1940, not 1850. 1951–1980 (the standard GISS
reference period) is used as the "early" window and shifted by
PREINDUSTRIAL_SHIFT_C to approximate 1850–1900 (global mean warming between
those periods ≈ 0.3 °C; local values differ). The 1940s are deliberately
excluded: ERA5's pre-1950 back-extension is observation-sparse and runs warm
in several regions (Delhi's 1940s sit 0.7 °C above its 1950s, for example).
To do this properly per city, replace the shift with a station/grid series
from Berkeley Earth (daily, 1880+) - same output format.

Run:  python3 data/climate_birthday/build.py
"""

from __future__ import annotations

import json
import ssl
import sys
import time
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np

try:  # macOS python.org builds often lack system CA bundles
    import certifi

    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except ImportError:  # pragma: no cover
    SSL_CTX = ssl.create_default_context()

OUT = Path(__file__).resolve().parents[2] / "public" / "climate" / "cities.json"
CACHE = Path(__file__).resolve().parent / "cache"

BASELINE = (1951, 1980)
CURRENT = (2006, 2025)
PREINDUSTRIAL_SHIFT_C = -0.3
HARMONICS = 3  # annual + 2 overtones; keeps the curve unimodal in each half-year

CITIES = [
    # (id, name, country, lat, lon)
    # UK & Ireland
    ("london", "London", "United Kingdom", 51.507, -0.128),
    ("aberteifi", "Aberteifi", "Wales", 52.083, -4.660),
    ("dublin", "Dublin", "Ireland", 53.350, -6.260),
    # Europe
    ("paris", "Paris", "France", 48.857, 2.352),
    ("berlin", "Berlin", "Germany", 52.520, 13.405),
    ("madrid", "Madrid", "Spain", 40.417, -3.703),
    ("rome", "Rome", "Italy", 41.903, 12.496),
    ("athens", "Athens", "Greece", 37.984, 23.728),
    ("istanbul", "Istanbul", "Türkiye", 41.008, 28.978),
    ("warsaw", "Warsaw", "Poland", 52.230, 21.012),
    ("stockholm", "Stockholm", "Sweden", 59.329, 18.069),
    ("oslo", "Oslo", "Norway", 59.913, 10.752),
    ("helsinki", "Helsinki", "Finland", 60.170, 24.938),
    ("moscow", "Moscow", "Russia", 55.756, 37.617),
    # Far north
    ("reykjavik", "Reykjavík", "Iceland", 64.147, -21.942),
    ("tromso", "Tromsø", "Norway", 69.649, 18.956),
    ("longyearbyen", "Longyearbyen", "Svalbard", 78.223, 15.627),
    ("murmansk", "Murmansk", "Russia", 68.970, 33.075),
    ("yakutsk", "Yakutsk", "Russia", 62.035, 129.675),
    ("nuuk", "Nuuk", "Greenland", 64.181, -51.694),
    ("iqaluit", "Iqaluit", "Canada", 63.746, -68.517),
    ("fairbanks", "Fairbanks", "United States", 64.838, -147.716),
    ("anchorage", "Anchorage", "United States", 61.218, -149.900),
    # North America
    ("vancouver", "Vancouver", "Canada", 49.283, -123.121),
    ("toronto", "Toronto", "Canada", 43.651, -79.383),
    ("new-york", "New York", "United States", 40.713, -74.006),
    ("chicago", "Chicago", "United States", 41.878, -87.630),
    ("denver", "Denver", "United States", 39.739, -104.990),
    ("los-angeles", "Los Angeles", "United States", 34.052, -118.244),
    ("miami", "Miami", "United States", 25.762, -80.192),
    ("honolulu", "Honolulu", "United States", 21.307, -157.858),
    ("mexico-city", "Mexico City", "Mexico", 19.433, -99.133),
    ("havana", "Havana", "Cuba", 23.113, -82.367),
    # South America
    ("caracas", "Caracas", "Venezuela", 10.480, -66.904),
    ("bogota", "Bogotá", "Colombia", 4.711, -74.072),
    ("quito", "Quito", "Ecuador", -0.180, -78.468),
    ("lima", "Lima", "Peru", -12.046, -77.043),
    ("la-paz", "La Paz", "Bolivia", -16.500, -68.150),
    ("manaus", "Manaus", "Brazil", -3.119, -60.022),
    ("rio-de-janeiro", "Rio de Janeiro", "Brazil", -22.907, -43.173),
    ("sao-paulo", "São Paulo", "Brazil", -23.551, -46.633),
    ("santiago", "Santiago", "Chile", -33.449, -70.669),
    ("buenos-aires", "Buenos Aires", "Argentina", -34.604, -58.382),
    ("montevideo", "Montevideo", "Uruguay", -34.901, -56.164),
    ("punta-arenas", "Punta Arenas", "Chile", -53.163, -70.908),
    ("ushuaia", "Ushuaia", "Argentina", -54.802, -68.303),
    # Africa & Middle East
    ("casablanca", "Casablanca", "Morocco", 33.573, -7.590),
    ("cairo", "Cairo", "Egypt", 30.044, 31.236),
    ("lagos", "Lagos", "Nigeria", 6.524, 3.379),
    ("accra", "Accra", "Ghana", 5.603, -0.187),
    ("addis-ababa", "Addis Ababa", "Ethiopia", 9.025, 38.747),
    ("nairobi", "Nairobi", "Kenya", -1.292, 36.822),
    ("kinshasa", "Kinshasa", "DR Congo", -4.322, 15.307),
    ("dar-es-salaam", "Dar es Salaam", "Tanzania", -6.792, 39.208),
    ("johannesburg", "Johannesburg", "South Africa", -26.204, 28.047),
    ("cape-town", "Cape Town", "South Africa", -33.925, 18.424),
    ("riyadh", "Riyadh", "Saudi Arabia", 24.714, 46.675),
    ("dubai", "Dubai", "UAE", 25.205, 55.271),
    ("tehran", "Tehran", "Iran", 35.689, 51.389),
    # Asia
    ("karachi", "Karachi", "Pakistan", 24.861, 67.010),
    ("delhi", "Delhi", "India", 28.614, 77.209),
    ("mumbai", "Mumbai", "India", 19.076, 72.878),
    ("chennai", "Chennai", "India", 13.083, 80.270),
    ("kathmandu", "Kathmandu", "Nepal", 27.717, 85.324),
    ("dhaka", "Dhaka", "Bangladesh", 23.811, 90.412),
    ("almaty", "Almaty", "Kazakhstan", 43.222, 76.851),
    ("ulaanbaatar", "Ulaanbaatar", "Mongolia", 47.886, 106.906),
    ("beijing", "Beijing", "China", 39.904, 116.407),
    ("shanghai", "Shanghai", "China", 31.230, 121.474),
    ("chengdu", "Chengdu", "China", 30.573, 104.067),
    ("hong-kong", "Hong Kong", "China", 22.319, 114.170),
    ("seoul", "Seoul", "South Korea", 37.566, 126.978),
    ("tokyo", "Tokyo", "Japan", 35.676, 139.650),
    ("sapporo", "Sapporo", "Japan", 43.062, 141.354),
    ("hanoi", "Hanoi", "Vietnam", 21.028, 105.834),
    ("bangkok", "Bangkok", "Thailand", 13.756, 100.502),
    ("singapore", "Singapore", "Singapore", 1.352, 103.820),
    ("jakarta", "Jakarta", "Indonesia", -6.208, 106.846),
    ("manila", "Manila", "Philippines", 14.600, 120.984),
    # Oceania
    ("darwin", "Darwin", "Australia", -12.464, 130.846),
    ("brisbane", "Brisbane", "Australia", -27.470, 153.026),
    ("perth", "Perth", "Australia", -31.951, 115.860),
    ("alice-springs", "Alice Springs", "Australia", -23.698, 133.881),
    ("sydney", "Sydney", "Australia", -33.869, 151.209),
    ("melbourne", "Melbourne", "Australia", -37.814, 144.963),
    ("hobart", "Hobart", "Australia", -42.882, 147.324),
    ("auckland", "Auckland", "New Zealand", -36.848, 174.763),
    ("christchurch", "Christchurch", "New Zealand", -43.532, 172.636),
    ("suva", "Suva", "Fiji", -18.141, 178.442),
    # Antarctica
    ("rothera", "Rothera Station", "Antarctica", -67.568, -68.128),
    ("mcmurdo", "McMurdo Station", "Antarctica", -77.846, 166.668),
    ("vostok", "Vostok Station", "Antarctica", -78.464, 106.837),
    ("south-pole", "South Pole", "Antarctica", -89.98, 0.0),
]


def fetch_daily(lat: float, lon: float, start: date, end: date) -> tuple[np.ndarray, np.ndarray]:
    q = urllib.parse.urlencode(
        {
            "latitude": lat,
            "longitude": lon,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "daily": "temperature_2m_mean",
            "timezone": "auto",
        }
    )
    url = f"https://archive-api.open-meteo.com/v1/archive?{q}"
    cache_file = CACHE / f"{lat}_{lon}_{start}_{end}.json"
    if cache_file.exists():
        payload = json.loads(cache_file.read_text())
    else:
        for attempt in range(6):
            try:
                with urllib.request.urlopen(url, timeout=120, context=SSL_CTX) as r:
                    payload = json.load(r)
                break
            except urllib.error.HTTPError as e:
                if e.code != 429 or attempt >= 1:
                    raise
                # Long daily requests are weighted heavily against the free quota.
                print("   429 - waiting 60 s", file=sys.stderr)
                time.sleep(60)
            except Exception as e:  # noqa: BLE001
                if attempt == 5:
                    raise
                print(f"   retry ({e})", file=sys.stderr)
                time.sleep(5 * (attempt + 1))
        CACHE.mkdir(parents=True, exist_ok=True)
        cache_file.write_text(json.dumps(payload))
    days = np.array(payload["daily"]["time"], dtype="datetime64[D]")
    temps = np.array(
        [np.nan if v is None else v for v in payload["daily"]["temperature_2m_mean"]],
        dtype=float,
    )
    return days, temps


def day_of_year(days: np.ndarray) -> np.ndarray:
    years = days.astype("datetime64[Y]")
    doy = (days - years).astype(int)  # 0-based
    # Fold 29 Feb onto 28 Feb so every year has 365 slots.
    leap = ((years.astype(int) + 1970) % 4 == 0) & (doy >= 59)
    doy = np.where(leap, doy - 1, doy)
    return np.clip(doy, 0, 364)


def climatology(days: np.ndarray, temps: np.ndarray, y0: int, y1: int) -> np.ndarray:
    years = days.astype("datetime64[Y]").astype(int) + 1970
    m = (years >= y0) & (years <= y1) & ~np.isnan(temps)
    doy = day_of_year(days[m])
    t = temps[m]
    # Fourier least squares directly on the daily samples (no binning bias).
    theta = 2 * np.pi * doy / 365.0
    cols = [np.ones_like(theta)]
    for k in range(1, HARMONICS + 1):
        cols += [np.cos(k * theta), np.sin(k * theta)]
    X = np.stack(cols, axis=1)
    coef, *_ = np.linalg.lstsq(X, t, rcond=None)
    grid = 2 * np.pi * np.arange(365) / 365.0
    gcols = [np.ones_like(grid)]
    for k in range(1, HARMONICS + 1):
        gcols += [np.cos(k * grid), np.sin(k * grid)]
    return np.stack(gcols, axis=1) @ coef


def main() -> None:
    today = date.today()
    out = {
        "meta": {
            "source": "ERA5 via Open-Meteo archive API (temperature_2m_mean)",
            "built": today.isoformat(),
            "baseline_years": list(BASELINE),
            "current_years": list(CURRENT),
            "preindustrial_shift_c": PREINDUSTRIAL_SHIFT_C,
            "harmonics": HARMONICS,
            "variable": "daily mean 2 m air temperature (°C)",
        },
        "cities": [],
    }
    failed: list[str] = []
    for cid, name, country, lat, lon in CITIES:
        print(f"→ {name}", file=sys.stderr)
        try:
            city = build_city(cid, name, country, lat, lon, today)
        except urllib.error.HTTPError as e:
            # Quota exhausted: keep what we have, rerun later (cache makes it cheap).
            print(f"   skipped ({e})", file=sys.stderr)
            failed.append(name)
            continue
        out["cities"].append(city)
        time.sleep(3.0)  # be polite to the free API
    if not out["cities"]:
        print("nothing fetched (quota?) - leaving existing output untouched", file=sys.stderr)
        sys.exit(1)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False))
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} kB, {len(out['cities'])} cities)", file=sys.stderr)
    if failed:
        print(f"missing (rerun later): {', '.join(failed)}", file=sys.stderr)
        sys.exit(1)


def build_city(cid: str, name: str, country: str, lat: float, lon: float, today: date) -> dict:
    # Two windows, fetched separately: less data per request, fewer 429s.
    b_days, b_temps = fetch_daily(lat, lon, date(BASELINE[0], 1, 1), date(BASELINE[1], 12, 31))
    c_days, c_temps = fetch_daily(lat, lon, date(CURRENT[0], 1, 1), min(today, date(CURRENT[1], 12, 31)))
    base = climatology(b_days, b_temps, *BASELINE) + PREINDUSTRIAL_SHIFT_C
    cur = climatology(c_days, c_temps, *CURRENT)
    return {
        "id": cid,
        "name": name,
        "country": country,
        "lat": lat,
        "lon": lon,
        "baseline": [round(float(v), 2) for v in base],
        "current": [round(float(v), 2) for v in cur],
    }


if __name__ == "__main__":
    main()

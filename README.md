# Climate Birthday

Pick a city and a date. The app finds the day of the year that now has
the temperature your date had before industrialisation.

- Live: https://jacob-davies.com/climate-birthday/
- Write-up: https://jacob-davies.com/blog/climate-birthday/

## How it fits together

`data/climate_birthday/build.py` downloads daily ERA5 temperatures from
the Open-Meteo archive, fits a smooth curve for a pre-industrial window
and a current window, and writes `public/climate/cities.json` with two
lists of 365 numbers per city. It runs once, offline.

The web app loads that file and does the matching in your browser with
the functions in `src/climate/mapping.ts`. `Chart.tsx` draws the two
curves and `Globe.tsx` draws the city markers.

## Running it

```
npm install
npm run dev
```

To rebuild the data you need Python 3 and NumPy:

```
python3 data/climate_birthday/build.py
```

The script caches raw API responses in `data/climate_birthday/cache/`,
so reruns don't use up the Open-Meteo quota again.

# LACartoons Scraper

## Strategy

LACartoons (`https://www.lacartoons.com`) is a public Ruby on Rails website with **no REST API**. The server fetches its HTML pages and parses them with `cheerio` (jQuery-style DOM selectors). Results are cached in memory with configurable TTLs.

File: `apps/server/src/services/libraryService.ts`

---

## Target URLs

| Purpose                | URL pattern                                                       |
|------------------------|-------------------------------------------------------------------|
| Serie episode list     | `https://www.lacartoons.com/serie/{lacartoons_serie_id}`          |
| Episode embed page     | `https://www.lacartoons.com/serie/capitulo/{id}?t={temporada}`   |

`lacartoons_serie_id` is the numeric ID from `library.json` (e.g. `23` for Coraje).

---

## Cheerio Selectors

### Serie page — season containers
```js
$('.temporada, [data-temporada], .season, .capitulos-temporada')
```
Each container represents one season. Season number is read from:
1. `data-temporada` or `data-season` attribute
2. Heading text (`h1–h4`) parsed with `/\d+/`
3. Fallback: sequential index

### Episode links inside a season container
```js
$el.find('a[href*="/serie/capitulo/"]')
```
- `href` → stored as `LibraryEpisodio.url` (kept as raw path, e.g. `/serie/capitulo/42?t=1`)
- Title → `$a.text().trim()`
- Capitulo number → extracted from title prefix (`/^Cap(?:ítulo)?\.?\s*(\d+)/i`) or URL path (`/\/serie\/capitulo\/(\d+)/`)

### Fallback (flat list)
If no season containers are found, all `a[href*="/serie/capitulo/"]` links on the page are collected into Temporada 1.

### Episode embed page
```js
$('iframe[src*="cubeembed"]').attr('src')
```
Returns the `src` of the first iframe whose URL contains `"cubeembed"`. Throws if not found.

---

## Cache TTL Values

| Cache                | Key           | TTL       |
|----------------------|---------------|-----------|
| Series list          | `'all'`       | 5 minutes |
| Serie episode detail | `{serieId}`   | 10 minutes |

---

## `library.json` Schema

Located at `apps/server/src/db/library.json`.

```json
[
  {
    "id": "coraje",
    "name": "Coraje el Perro Cobarde",
    "lacartoons_serie_id": 23,
    "thumbnail": null,
    "active": true
  },
  {
    "id": "tom-y-jerry",
    "name": "Tom y Jerry",
    "lacartoons_serie_id": 1,
    "thumbnail": null,
    "active": true
  },
  {
    "id": "scooby-doo",
    "name": "Scooby-Doo",
    "lacartoons_serie_id": 5,
    "thumbnail": null,
    "active": true
  }
]
```

### Fields

| Field                 | Type            | Description                                       |
|-----------------------|-----------------|---------------------------------------------------|
| `id`                  | `string`        | Slug used in API routes and localStorage keys     |
| `name`                | `string`        | Display name shown in UI                          |
| `lacartoons_serie_id` | `number`        | Numeric ID in the lacartoons.com URL path         |
| `thumbnail`           | `string\|null`  | Optional thumbnail image URL                      |
| `active`              | `boolean`       | Set `false` to hide from the UI without removing  |

---

## Adding a New Serie

1. Find the serie on `https://www.lacartoons.com` and copy its numeric ID from the URL (e.g. `https://www.lacartoons.com/serie/7` → ID is `7`).
2. Add a new entry to `apps/server/src/db/library.json`:
   ```json
   {
     "id": "my-serie-slug",
     "name": "Display Name",
     "lacartoons_serie_id": 7,
     "thumbnail": null,
     "active": true
   }
   ```
3. The server will pick it up on the next request (no restart needed — cache is just memory).
4. Cache refreshes automatically after TTL expiry (5 min for list, 10 min for episodes).

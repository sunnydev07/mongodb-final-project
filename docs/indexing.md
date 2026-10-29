# Queries and Index Design

## 1. Objectives

The catalogue is read-heavy: most traffic is product listing, search, and detail views. The index design targets those reads while keeping the number of indexes (and therefore write cost) reasonable.

The main query shapes are:

1. equality on `category` or `brand`, optionally a price range, sorted by price;
2. tag containment (`tags: "popular"`);
3. full-text search across name, description, brand, and category;
4. geospatial `$near`;
5. availability filters (`isActive`, `inStock`) with price ordering;
6. top-rated and newest listings;
7. seller catalogue lookup;
8. order history by customer, status, product, or amount.

## 2. Applying the ESR rule

For compound indexes, MongoDB recommends **Equality → Sort → Range**:

- fields compared with equality come first;
- fields used for sorting come next;
- range fields come last.

`{ category: 1, price: -1 }` follows this pattern for:

```js
Product.find({ category: 'Mobiles', price: { $gte: 10000, $lte: 50000 } })
  .sort({ price: -1 })
  .limit(20);
```

`category` is equality, `price` is both range and sort. Because the index stores `price` descending, MongoDB can walk the matching category slice in the requested order and stop after 20 documents. `{ brand: 1, price: -1 }` serves the same pattern for brand pages.

A query that filters on both category and brand can use either compound index and filter the second field in memory; at this scale that is cheaper than maintaining a third three-field index.

## 3. Index catalogue

Run `npm run indexes` to apply and print the current definitions. The expected catalogue is:

### `users`

| Index | Options | Purpose |
| --- | --- | --- |
| `{ _id: 1 }` | default | Primary key |
| `{ email: 1 }` | unique | Login and duplicate-email enforcement |
| `{ role: 1, isActive: 1 }` | — | Admin user filters |

### `products`

| Index | Options | Purpose |
| --- | --- | --- |
| `{ _id: 1 }` | default | Primary key |
| `{ sku: 1 }` | unique | SKU lookup/uniqueness |
| `{ category: 1, price: -1 }` | — | Category listing + price sort/range |
| `{ brand: 1, price: -1 }` | — | Brand listing + price sort/range |
| `{ tags: 1 }` | multikey | Tag filters |
| `{ name: "text", description: "text", brand: "text", category: "text" }` | text | Full-text search and text score |
| `{ location: "2dsphere" }` | 2dsphere | `$near` / geospatial queries |
| `{ isActive: 1, inStock: 1, price: 1 }` | — | Storefront availability filter |
| `{ price: 1 }` | — | Global price ordering/range |
| `{ rating: -1 }` | — | Top-rated listings |
| `{ createdAt: -1 }` | — | Newest listings |
| `{ seller.id: 1 }` | — | Seller catalogue |

### `orders`

| Index | Options | Purpose |
| --- | --- | --- |
| `{ _id: 1 }` | default | Primary key |
| `{ orderNumber: 1 }` | unique | Order lookup/uniqueness |
| `{ customer: 1, createdAt: -1 }` | — | Customer order history, newest first |
| `{ status: 1, orderDate: -1 }` | — | Operations queue by status/date |
| `{ items.product: 1 }` | multikey | “Orders containing this product” |
| `{ totalAmount: -1 }` | — | Revenue/high-value order queries |

### `reviews`

| Index | Options | Purpose |
| --- | --- | --- |
| `{ _id: 1 }` | default | Primary key |
| `{ product: 1, createdAt: -1 }` | — | Product review list, newest first |
| `{ user: 1, product: 1 }` | unique | One review per user per product |

## 4. Query-to-index mapping

| Endpoint / query | Filter / sort | Index used |
| --- | --- | --- |
| `GET /api/products?category=Mobiles&sort=price_desc` | `category`, `price` sort | `{ category: 1, price: -1 }` |
| `GET /api/products?brand=Samsung&sort=price_desc` | `brand`, `price` sort | `{ brand: 1, price: -1 }` |
| `GET /api/products?tag=popular` | multikey `tags` | `{ tags: 1 }` |
| `GET /api/products?search=Samsung` | `$text` + text score | text index |
| `GET /api/products?near=77.5,11.5,10000` | `$near` | `{ location: "2dsphere" }` |
| `GET /api/products?inStock=true&isActive=true&sort=price_asc` | equality + price sort | `{ isActive: 1, inStock: 1, price: 1 }` |
| `GET /api/products?sort=rating` | `rating` sort | `{ rating: -1 }` |
| `GET /api/products?sort=newest` | `createdAt` sort | `{ createdAt: -1 }` |
| `GET /api/orders` (customer) | `customer`, `createdAt` sort | `{ customer: 1, createdAt: -1 }` |
| `GET /api/products/:id/reviews` | `product`, `createdAt` sort | `{ product: 1, createdAt: -1 }` |

## 5. Benchmark

`scripts/benchmark.js` uses `explain('executionStats')` twice per scenario:

1. with the index available (normal planner choice);
2. with `hint({ $natural: 1 })`, which forces a collection scan even though the index exists.

Forcing a collection scan on the same dataset makes before/after comparison fair without dropping indexes or duplicating data. The script prints the winning plan stages, documents examined, keys examined, documents returned, and execution time.

Run:

```bash
npm run seed       # 500 products
npm run indexes
npm run benchmark
```

Representative output from the seeded dataset:

```text
Benchmarking 500 product documents

Scenario                    Mode      Stage                                     Docs   Keys   Returned  ms
--------------------------------------------------------------------------------------------------------------
Category + price range     INDEX     LIMIT -> FETCH -> IXSCAN                      20     20        20    0
Category + price range     COLLSCAN  SORT -> COLLSCAN                             500      0        20    0
Brand equality + sort      INDEX     LIMIT -> FETCH -> IXSCAN                      20     20        20    0
Brand equality + sort      COLLSCAN  SORT -> COLLSCAN                             500      0        20    0
Tags multikey              INDEX     LIMIT -> FETCH -> IXSCAN                      20     20        20    0
Tags multikey              COLLSCAN  LIMIT -> COLLSCAN                            90      0        20    0
Rating top-N               INDEX     LIMIT -> FETCH -> IXSCAN                      11     11        10    0
Rating top-N               COLLSCAN  SORT -> COLLSCAN                             500      0        10    0
Text search                INDEX     PROJECTION_DEFAULT -> SORT -> TEXT_MATCH      36     36        10    0
Geospatial $near           INDEX     LIMIT -> GEO_NEAR_2DSPHERE -> FETCH -> I       2     16         2    0
```

### How to read the numbers

| Field | Meaning |
| --- | --- |
| `Docs` (`totalDocsExamined`) | Documents fetched from storage; the most important cost signal here |
| `Keys` (`totalKeysExamined`) | Index entries scanned |
| `Returned` (`nReturned`) | Documents returned |
| `IXSCAN` | Index range scan; the planner used an index |
| `COLLSCAN` | Full collection scan |
| `FETCH` | Fetch the full document after an index match |
| `SORT` | In-memory sort; ideally avoided by index order |
| `LIMIT` | Stop after the requested number of documents |
| `TEXT_MATCH` | Text index match stage |
| `GEO_NEAR_2DSPHERE` | Geospatial index scan |

At 500 documents the millisecond differences are negligible and noisy. **Documents examined** show the design difference clearly: the indexed category query examines 20 documents instead of 500, and the rating top-N examines 11 instead of 500. As the collection grows, that ratio directly determines latency and cache pressure.

The tag COLLSCAN examines only 90 documents rather than 500 because the `$natural` scan can stop after 20 matches; the index still avoids scanning non-matching documents and remains selective as data grows.

Text and geospatial scenarios have no forced-COLLSCAN row: a `$text` query and `$near` query require their special indexes to execute, so a “no index” comparison is not meaningful.

## 6. Why some plans still contain `SORT`

A `SORT` stage is not automatically a problem, but it becomes expensive when the working set exceeds the in-memory sort limit (100 MB by default). The benchmark queries were intentionally written so the compound indexes satisfy the sort. If a query combines filters that do not match the index prefix, MongoDB may still sort in memory.

To diagnose:

```js
db.products.find({ category: 'Mobiles', brand: 'Samsung' })
  .sort({ price: -1 })
  .explain('executionStats');
```

Look for `SORT` versus `IXSCAN` order and compare `totalDocsExamined` with `nReturned`. If `totalDocsExamined` is much larger than `nReturned`, the index is not selective enough for that query.

## 7. Text and geospatial notes

### Text index

- A collection can have **at most one text index**.
- The index covers `name`, `description`, `brand`, and `category`.
- Queries use `$text: { $search: '...' }` and can project/sort by `{ $meta: 'textScore' }`.
- Text search is word-based and applies stemming/stop words; it is not a fuzzy or substring search.
- For richer relevance, autocomplete, and typo tolerance, use Atlas Search.

### Geospatial index

- `location` is GeoJSON: `{ type: 'Point', coordinates: [longitude, latitude] }`.
- The API accepts `near=lng,lat[,maxDistanceMeters]` and builds a `$near` query.
- `$near` returns results nearest-first; `$maxDistance` is in metres.
- A `2dsphere` index also supports `$geoWithin` and `$geoNear` (aggregation).

## 8. Index maintenance and trade-offs

- **Every index costs write time and disk space.** The catalogue keeps only indexes tied to real query patterns.
- **`autoIndex` is disabled in production** in `src/config/db.js`. Run `npm run indexes` (or a deployment migration) to sync indexes deliberately.
- **`syncIndexes()` drops indexes that are not in the schema.** That is useful in development but should be reviewed before running against production.
- **Unique indexes are correctness constraints**, not just performance tools: email, SKU, order number, and one-review-per-user-product rely on them.
- **Avoid redundant single-field indexes.** `category` and `brand` do not need standalone indexes because their compound indexes have those fields as prefixes. Removing implicit `index: true` declarations eliminated duplicates.
- **Monitor index usage** with `$indexStats` and the MongoDB profiler; drop indexes that are never used.

```js
db.products.aggregate([{ $indexStats: {} }]);
db.setProfilingLevel(1, { slowms: 50 });
db.system.profile.find().sort({ ts: -1 }).limit(5).pretty();
```

## 9. Commands

```bash
npm run indexes     # sync + print all indexes
npm run benchmark   # explain() index vs collection scan
npm run seed        # rebuild the 500-product dataset
```

Manual checks:

```bash
mongosh mongodb://127.0.0.1:27017/mongo_final_project --eval "db.products.getIndexes()"
mongosh mongodb://127.0.0.1:27017/mongo_final_project --eval "db.products.find({category:'Mobiles'}).sort({price:-1}).limit(5).explain('executionStats')"
```

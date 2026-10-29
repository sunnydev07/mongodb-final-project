# API Reference

Base URL: `http://localhost:4000`

Interactive OpenAPI UI: `/api-docs`  
Raw OpenAPI JSON: `/api-docs.json`

## Conventions

### Response envelope

Successful responses:

```json
{
  "success": true,
  "data": {},
  "meta": {
    "total": 120,
    "page": 1,
    "limit": 20,
    "pages": 6,
    "hasPrev": false,
    "hasNext": true
  }
}
```

`meta` is present on paginated list endpoints. Errors:

```json
{
  "success": false,
  "message": "Validation failed",
  "details": [{ "path": "price", "message": "Expected number, received string" }]
}
```

`details` is present for Zod validation errors. Stack traces are added only outside production.

### Authentication

Protected routes expect:

```http
Authorization: Bearer <JWT>
```

Obtain a token from `POST /api/auth/register` or `POST /api/auth/login`. Tokens expire after `JWT_EXPIRES_IN` (default `7d`).

### Roles

| Role | Capabilities |
| --- | --- |
| `customer` | Browse products, review products, create orders, read own orders/profile |
| `seller` | Customer capabilities + create products and update own products |
| `admin` | Full access, including user/order/product deletion, all orders, analytics |

Registration accepts only `customer` and `seller`. Admin accounts are created by seeding or administration.

### Pagination

List endpoints accept `page` (default `1`) and `limit` (default `20`, max `100`).

### Status codes

| Code | Meaning |
| --- | --- |
| `200` | Success |
| `201` | Created |
| `204` | Deleted (no body) |
| `400` | Validation error or invalid id |
| `401` | Missing/invalid token or bad credentials |
| `403` | Authenticated but not allowed |
| `404` | Resource not found |
| `409` | Duplicate value, duplicate review, or insufficient stock |
| `429` | Rate limit exceeded |
| `500` | Unhandled server error |

---

## Health

### `GET /health`

Public liveness probe.

```json
{
  "success": true,
  "status": "ok",
  "uptime": 14.4389109,
  "timestamp": "2026-10-29T08:02:06.627Z"
}
```

---

## Authentication

### `POST /api/auth/register`

Public. Creates a customer or seller.

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "password": "Password123!",
  "role": "customer"
}
```

`role` is optional (`customer` default). Password must be 8–128 characters. Response `201`:

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "665f...",
      "name": "Alice",
      "email": "alice@example.com",
      "role": "customer",
      "isActive": true
    },
    "token": "eyJhbGciOi..."
  }
}
```

Errors: `400` validation, `409` duplicate email.

### `POST /api/auth/login`

Public.

```json
{ "email": "alice@example.com", "password": "Password123!" }
```

Returns the same `{ user, token }` shape with `200`. Errors: `401` invalid credentials, `403` disabled account.

### `GET /api/auth/me`

Authenticated. Returns the current user without the password.

```bash
curl http://localhost:4000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## Products

### `GET /api/products`

Public. Paginated catalogue.

| Query | Type | Description |
| --- | --- | --- |
| `page`, `limit` | integer | Pagination |
| `category` | string | Exact category filter |
| `brand` | string | Exact brand filter |
| `tag` | string | Multikey tag filter |
| `minPrice`, `maxPrice` | number | Price range |
| `inStock` | `true`/`false` | Availability filter |
| `isActive` | `true`/`false` | Active listing filter |
| `featured` | `true`/`false` | Featured filter |
| `search` | string | Full-text search over name, description, brand, category |
| `sort` | enum | `price_asc`, `price_desc`, `rating`, `newest`, `name` |
| `near` | string | `lng,lat[,maxDistanceMeters]` geospatial search |

Examples:

```bash
# Category + price range, newest first
curl "http://localhost:4000/api/products?category=Mobiles&minPrice=5000&maxPrice=50000&sort=price_desc&limit=10"

# Full-text search
curl "http://localhost:4000/api/products?search=Samsung&limit=5"

# Geospatial search around longitude 77.5, latitude 11.5, within 10 km
curl "http://localhost:4000/api/products?near=77.5,11.5,10000&limit=5"

# Out-of-stock products only
curl "http://localhost:4000/api/products?inStock=false&limit=100"
```

Response `200`:

```json
{
  "success": true,
  "data": [
    {
      "_id": "665f...",
      "sku": "SKU-000123",
      "name": "Samsung Android 123",
      "category": "Mobiles",
      "brand": "Samsung",
      "price": 24999,
      "discountedPrice": 22499,
      "stock": 42,
      "inStock": true,
      "rating": 4.3,
      "reviewCount": 18,
      "tags": ["popular", "discount"],
      "location": { "type": "Point", "coordinates": [77.61, 11.92] }
    }
  ],
  "meta": { "total": 32, "page": 1, "limit": 10, "pages": 4, "hasPrev": false, "hasNext": true }
}
```

### `GET /api/products/analytics/overview`

Public aggregation dashboard.

```json
{
  "success": true,
  "data": {
    "byCategory": [{ "_id": "Mobiles", "products": 52, "avgPrice": 48123, "avgRating": 3.4, "totalStock": 12400 }],
    "byBrand": [{ "_id": "Samsung", "products": 45, "avgPrice": 43900, "avgRating": 3.2 }],
    "priceBuckets": [{ "_id": 10000, "count": 120, "avgRating": 3.1 }],
    "topRated": [{ "name": "Sony Headphones 12", "rating": 5, "reviewCount": 299 }],
    "inventorySummary": [{ "totalProducts": 500, "activeProducts": 476, "inStockProducts": 430, "inventoryValue": 6446369396, "avgPrice": 34210 }]
  }
}
```

### `GET /api/products/:id`

Public product detail. `404` if missing, `400` for a malformed id.

### `POST /api/products`

Seller/admin. `seller.id` and `seller.name` are always taken from the authenticated user, even if a `seller` object is supplied.

```json
{
  "sku": "SKU-900001",
  "name": "Samsung Galaxy Test",
  "description": "A test smartphone with great battery life",
  "category": "Mobiles",
  "subCategory": "Android",
  "brand": "Samsung",
  "price": 24999,
  "discountPercentage": 10,
  "stock": 50,
  "tags": ["new", "popular"],
  "images": ["https://example.com/phone.jpg"],
  "coordinates": [77.5, 11.5],
  "isFeatured": true
}
```

`discountedPrice` and `inStock` are derived in a `pre('save')` hook. Response `201` with the created product.

### `PATCH /api/products/:id`

Seller (own product) or admin. Accepts any create field except `sku`; `coordinates` updates the GeoJSON point. Recomputes discounted price and stock flag because the controller saves the document.

### `DELETE /api/products/:id`

Admin only. Returns `204` and removes associated reviews.

---

## Reviews

### `GET /api/products/:productId/reviews`

Public. Paginated reviews, newest first, with reviewer name populated.

```json
{
  "success": true,
  "data": [
    {
      "_id": "665f...",
      "product": "665e...",
      "user": { "_id": "665d...", "name": "Alice" },
      "rating": 5,
      "title": "Excellent",
      "comment": "Works as advertised.",
      "verifiedPurchase": true,
      "createdAt": "2026-10-29T08:02:14.000Z"
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 20, "pages": 1, "hasPrev": false, "hasNext": false }
}
```

### `POST /api/products/:productId/reviews`

Authenticated. One review per user per product.

```json
{ "rating": 5, "title": "Excellent", "comment": "Works as advertised." }
```

- `rating` is required, integer 1–5.
- `verifiedPurchase` is set automatically if the user has an order containing the product.
- Product `rating` and `reviewCount` are recomputed after every create/update/delete.
- Errors: `404` product not found, `409` already reviewed.

### `PATCH /api/reviews/:id`

Author or admin. Accepts `rating`, `title`, `comment`.

### `DELETE /api/reviews/:id`

Author or admin. Returns `204` and recomputes the product rating.

---

## Orders

### `POST /api/orders`

Authenticated. Creates an order and decrements stock.

```json
{
  "items": [{ "productId": "665e...", "quantity": 2 }],
  "paymentMethod": "UPI",
  "shippingAddress": { "street": "1 Main St", "city": "Chennai", "country": "India" },
  "tax": 180,
  "shippingCost": 0
}
```

- `paymentMethod`: `UPI`, `card`, `netbanking`, `cod`, or `wallet`.
- `items` must contain at least one entry with a positive integer quantity.
- Unit prices are read from the database; totals are computed server-side.
- Stock is decremented with a conditional `$inc`; insufficient stock returns `409`.
- On a replica set, order creation and stock updates run in a transaction. On standalone MongoDB, the code falls back to sequential writes.

Response `201`:

```json
{
  "success": true,
  "data": {
    "_id": "665f...",
    "orderNumber": "ORD-MVT99CSS-2C95AI",
    "customer": "665d...",
    "items": [
      {
        "product": "665e...",
        "sku": "SKU-000123",
        "name": "Samsung Android 123",
        "quantity": 2,
        "unitPrice": 22499,
        "lineTotal": 44998
      }
    ],
    "subtotal": 44998,
    "tax": 180,
    "shippingCost": 0,
    "totalAmount": 45178,
    "status": "pending",
    "payment": { "method": "UPI", "status": "pending" },
    "orderDate": "2026-10-29T08:02:00.000Z"
  }
}
```

### `GET /api/orders`

Authenticated. Customers see only their own orders; admins see all. Optional `status` and `customer` filters (customer filter ignored for customers). Sorted newest first, paginated, customer populated.

### `GET /api/orders/:id`

Owner or admin. Populates customer (`name`, `email`) and product summaries (`name`, `sku`, `images`). Returns `403` for another customer's order.

### `PATCH /api/orders/:id/status`

Admin/seller.

```json
{ "status": "shipped", "paymentStatus": "completed", "transactionId": "TXN123" }
```

- `status`: `pending`, `processing`, `shipped`, `delivered`, `cancelled`, `returned`.
- `paymentStatus`: `pending`, `completed`, `failed`, `refunded`.
- Cancelling an order restores stock and records `cancelledAt`/`cancellationReason`.
- Delivering an order records `deliveredAt`.

### `DELETE /api/orders/:id`

Admin only. Returns `204`. Note: deleting an order does **not** restore stock automatically.

### `GET /api/orders/analytics/overview`

Admin. Returns:

- `byStatus`: order counts, revenue, and average order value by status;
- `dailyRevenue`: last 30 days of revenue for processing/shipped/delivered orders;
- `topProducts`: top 10 products by revenue, using `$unwind` + `$group`.

### `GET /api/orders/customer/:id/summary`

Self or admin. Returns order count, total spent, average order value, and first/last order dates. Customers receive `403` for another user's id.

---

## Users

### `GET /api/users`

Admin. Paginated. Optional `role`, `isActive`, and case-insensitive `search` on name.

### `GET /api/users/:id`

Authenticated. Returns the profile without the password.

### `PATCH /api/users/:id`

Self or admin. Accepts `name`, `email`, `password`, `addresses`. Non-admins cannot change `role` or `isActive`; those fields are silently removed. Password changes go through the document save hook, so the new password is hashed.

```json
{
  "name": "Alice Updated",
  "addresses": [{ "label": "home", "street": "1 Main St", "city": "Chennai", "isDefault": true }]
}
```

### `DELETE /api/users/:id`

Admin. Returns `204`. Existing orders/reviews are not cascaded; retain them for historical records or clean them up explicitly.

---

## Error examples

```json
// 400 validation
{ "success": false, "message": "Validation failed", "details": [{ "path": "items.0.productId", "message": "Invalid input: expected string, received number" }] }

// 401
{ "success": false, "message": "Invalid or expired token" }

// 403
{ "success": false, "message": "Insufficient permissions" }

// 404
{ "success": false, "message": "Product not found" }

// 409
{ "success": false, "message": "Insufficient stock for Samsung Android 123: requested 100, available 8" }
```

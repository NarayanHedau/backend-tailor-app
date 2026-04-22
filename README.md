# Tailor-App — Backend API

REST API for the Tailor-App stitching management system. Built with Node.js, Express, and MongoDB.

See the [top-level README](../README.md) for a project overview.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Folder Structure](#folder-structure)
3. [Setup](#setup)
4. [Environment Variables](#environment-variables)
5. [Running the Server](#running-the-server)
6. [Database Models](#database-models)
7. [API Reference](#api-reference)
8. [Authentication](#authentication)
9. [Error Handling](#error-handling)
10. [Logging](#logging)
11. [Deployment](#deployment)

---

## Tech Stack

| Concern | Package |
|---|---|
| Web framework | express ^4.18.2 |
| ODM | mongoose ^8.0.3 |
| Auth | jsonwebtoken ^9.0.2, bcryptjs ^2.4.3 |
| Uploads | multer ^1.4.5, cloudinary |
| Notifications | twilio ^4.19.3 |
| Validation | joi ^17.11.0 |
| Logging | winston ^3.11.0, morgan |
| Error flow | express-async-errors |
| Security | helmet, express-rate-limit, express-mongo-sanitize |
| Dev reload | nodemon |

---

## Folder Structure

```
backend-tailor-app/
├── config/
│   ├── db.js                  ← MongoDB connection; triggers seedAdmin
│   └── seed.js                ← Creates default admin user
├── controllers/               ← Request handlers (business logic)
│   ├── authController.js
│   ├── customerController.js
│   ├── orderController.js
│   ├── invoiceController.js
│   ├── productController.js
│   ├── purchaseController.js
│   ├── saleController.js
│   ├── supplierController.js
│   └── trackingController.js
├── middlewares/
│   ├── authMiddleware.js      ← JWT verification (protect)
│   ├── errorMiddleware.js     ← Global error handler
│   └── uploadMiddleware.js    ← Multer memory storage, 5 MB limit
├── models/                    ← Mongoose schemas
│   ├── User.js
│   ├── Customer.js
│   ├── Order.js
│   ├── Invoice.js
│   ├── Product.js
│   ├── Purchase.js
│   ├── Sale.js
│   └── Supplier.js
├── routes/                    ← Express routers
│   ├── authRoutes.js
│   ├── customerRoutes.js
│   ├── orderRoutes.js
│   ├── invoiceRoutes.js
│   ├── trackingRoutes.js
│   ├── supplierRoutes.js
│   ├── productRoutes.js
│   ├── purchaseRoutes.js
│   └── saleRoutes.js
├── services/
│   ├── cloudinaryService.js   ← Image upload / delete
│   └── notificationService.js ← Twilio WhatsApp + SMS
├── utils/
│   ├── generateTrackingId.js  ← 8-char hex uppercase ID
│   ├── logger.js              ← Winston logger
│   └── validators.js          ← Joi schemas
├── seed-import/users.json     ← Optional batch user import
├── logs/                      ← error.log, combined.log
├── server.js                  ← App entry point
├── vercel.json                ← Vercel serverless config
└── package.json
```

---

## Setup

```bash
cd backend-tailor-app
npm install
cp .env.example .env   # if present; otherwise create .env manually
```

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `PORT` | HTTP port | `5000` |
| `NODE_ENV` | Runtime mode | `development` / `production` |
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/tailor_db` |
| `JWT_SECRET` | **Required.** Long random string. Server refuses to start in production if unset. | `openssl rand -hex 48` output |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `ADMIN_EMAIL` | Admin email, seeded on first boot. Required in production. | `owner@yourshop.com` |
| `ADMIN_PASSWORD` | Admin password, seeded on first boot. Required in production. | a strong passphrase |
| `FRONTEND_URL` | **Required in production.** CORS allowlist + tracking-URL base. Single origin or comma-separated list. No wildcard fallback. | `https://app.yourshop.com` |
| `CLOUDINARY_CLOUD_NAME` | Optional — image uploads disabled if unset | `my-cloud` |
| `CLOUDINARY_API_KEY` | Optional | `1234…` |
| `CLOUDINARY_API_SECRET` | Optional | `abcd…` |
| `TWILIO_ACCOUNT_SID` | Optional — notifications disabled if unset | `AC…` |
| `TWILIO_AUTH_TOKEN` | Optional | `…` |
| `TWILIO_PHONE_NUMBER` | Optional — SMS-capable Twilio number | `+1234567890` |
| `TWILIO_WHATSAPP_NUMBER` | Optional — WhatsApp sandbox / business number | `whatsapp:+14155238886` |

---

## Running the Server

```bash
npm run dev     # development with nodemon
npm start       # production (node server.js)
```

Server listens on `http://localhost:PORT` (default 5000). Health check:

```
GET /api/health
```

---

## Database Models

### User
| Field | Type | Notes |
|---|---|---|
| name | String | required |
| email | String | unique, required |
| password | String | bcrypt, 10 rounds |
| role | String | enum: `admin`, default `admin` |
| timestamps | — | createdAt, updatedAt |

### Customer
| Field | Type | Notes |
|---|---|---|
| name | String | required |
| phone | String | unique, indexed, required |
| email, address | String | optional |
| measurement_profiles | Array | label + chest/waist/hips/shoulder/sleeve/length/neck/inseam/thigh/notes |

Full-text index on `name` + `phone`.

### Order
| Field | Type | Notes |
|---|---|---|
| customer_id | ObjectId → Customer | required |
| order_number | String | auto `ORD-XXXX-YYYY` |
| tracking_id | String | auto 8-char hex, unique |
| order_date | Date | default now |
| trial_date, delivery_date | Date | — |
| status | String | `PENDING` / `IN_PROGRESS` / `COMPLETED` / `DELIVERED` / `CANCELLED` |
| items | Array | type, quantity, status, measurements, cloth_image, description, price |
| notes | String | — |

Item types: `Shirt`, `Pant`, `Suit`, `Kurta`, `Blouse`, `Dress`, `Jacket`, `Other`.
Item statuses: `PENDING`, `STITCHING`, `READY`.

### Invoice
- Linked 1:1 to `Order` via `order_id`.
- Auto-numbered `INV-XXXX-YYYY`.
- Tracks `total_amount`, `advance_paid`, `discount`, `pending_amount`.
- `payment_status`: `PAID` / `PARTIAL` / `PENDING`.
- `payment_history[]`: amount, date, method (`CASH` / `CARD` / `UPI` / `BANK`).

### Product (Inventory)
- `category`: `Fabric`, `Thread`, `Button`, `Zipper`, `Lining`, `Accessory`, `Other`.
- `unit`: `Meter`, `Yard`, `Piece`, `Roll`, `Kg`, `Set`, `Dozen`.
- `stock_quantity`, `purchase_price`, `selling_price`, `low_stock_alert`.

### Supplier
- `name`, `phone`, `email`, `company`, `gst_number`, `address`.

### Purchase
- Auto bill no. `PUR-XXXX`.
- `supplier_id`, `items[]`, `subtotal`, `discount`, `tax`, `total_amount`.
- `amount_paid`, `balance_due`, `payment_status` (`UNPAID` / `PARTIAL` / `PAID`).
- `payment_method`: `CASH` / `CARD` / `UPI` / `BANK` / `CHEQUE`.

### Sale
- Auto bill no. `SALE-XXXX`.
- Optional `customer_id`, plus free-text `customer_name` + `customer_phone`.
- `sale_type`: `RETAIL` / `WHOLESALE`.
- Payment fields identical to Purchase (minus `CHEQUE`).

---

## API Reference

> All protected routes require an `Authorization: Bearer <JWT>` header. JSON request bodies.

### Auth — `/api/auth`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/login` | public | Admin login, returns `{ token, user }` |
| GET | `/me` | protected | Current user profile |
| PUT | `/change-password` | protected | Change admin password |

### Customers — `/api/customers` *(all protected)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List customers (pagination + search) |
| POST | `/` | Create customer |
| GET | `/:id` | Get customer details |
| PUT | `/:id` | Update customer |
| DELETE | `/:id` | Delete customer |
| POST | `/:id/measurements` | Add measurement profile |
| PUT | `/:id/measurements/:profileId` | Update profile |
| DELETE | `/:id/measurements/:profileId` | Delete profile |

### Orders — `/api/orders` *(all protected)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List orders (status / search / date range / pagination) |
| POST | `/` | Create order; generates tracking ID and sends WhatsApp message |
| GET | `/stats` | Dashboard statistics |
| GET | `/deadlines` | Upcoming trial / delivery deadlines |
| GET | `/chart-data` | Analytics chart data |
| GET | `/:id` | Get order |
| PUT | `/:id` | Update order |
| DELETE | `/:id` | Delete order |
| PUT | `/:orderId/items/:itemId/status` | Update item status |
| PUT | `/:orderId/items/:itemId/measurements` | Update item measurements |
| POST | `/:orderId/items/:itemId/image` | Upload cloth image (multipart) |

### Invoices — `/api/invoices` *(all protected)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List invoices |
| POST | `/` | Create invoice for an order |
| GET | `/order/:orderId` | Get invoice by order id |
| POST | `/:id/payment` | Record a payment |

### Suppliers — `/api/suppliers` *(all protected)*
Standard CRUD: `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`.

### Products — `/api/products` *(all protected)*
Standard CRUD: `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id`.

### Purchases — `/api/purchases` *(all protected)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List |
| POST | `/` | Create |
| GET | `/stats` | Statistics |
| GET | `/business-chart` | Chart data |
| GET | `/:id` | Get |
| DELETE | `/:id` | Delete |
| POST | `/:id/payment` | Record payment |

### Sales — `/api/sales` *(all protected)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/` | List |
| POST | `/` | Create |
| GET | `/stats` | Statistics |
| GET | `/:id` | Get |
| DELETE | `/:id` | Delete |
| POST | `/:id/payment` | Record payment |

### Tracking — `/api/track` *(PUBLIC)*
| Method | Path | Purpose |
|---|---|---|
| GET | `/:trackingId` | Look up an order by its 8-char tracking ID |

### Health — `/api/health`
Simple uptime check.

---

## Authentication

1. `POST /api/auth/login` with `{ email, password }`.
2. Response contains a signed JWT (default lifetime 7 days).
3. Attach the token to subsequent requests:
   ```
   Authorization: Bearer <token>
   ```
4. `authMiddleware` verifies the token and attaches `req.user`. Expired or invalid tokens produce `401 Unauthorized`.

Password storage: bcrypt with 10 salt rounds. Admins are seeded from env vars on the first DB connection; additional admins can be added by directly inserting into the `users` collection or extending the auth controller.

---

## Security Middleware

The server ships with the following hardening enabled out of the box:

| Middleware | Purpose |
|---|---|
| `helmet()` | Sets standard security headers (X-Frame-Options, X-Content-Type-Options, etc.) |
| `cors()` | Strict allowlist sourced from `FRONTEND_URL`. **No wildcard fallback in production** — the server exits on boot if `FRONTEND_URL` is unset. Supports comma-separated origins. |
| `express-mongo-sanitize` | Strips `$` and `.` keys from `req.body`, `req.query`, and `req.params` to block NoSQL operator injection. |
| `express-rate-limit` | 300 req / 15 min global on `/api/*`; 10 failed login attempts / 15 min on `/api/auth/login`. |
| `express.json({ limit: '1mb' })` | Caps JSON body size to mitigate memory DoS. |

### Startup safety checks
- Missing `JWT_SECRET` in production → server exits with a clear log message.
- Missing `FRONTEND_URL` in production → server exits.
- Missing `ADMIN_EMAIL` / `ADMIN_PASSWORD` in production on first boot → admin seeding is skipped (seed manually afterwards).

In **development**, all three fall back to safe throw-away values with a warning in the logs, so the app still boots for first-time setup.

---

## Error Handling

- `express-async-errors` ensures thrown errors in async handlers flow to the global error middleware.
- `middlewares/errorMiddleware.js` maps common failures:
  - Mongoose `CastError` → `400 Invalid id`
  - Duplicate-key (`11000`) → `409 Conflict`
  - Validation errors → `400` with field messages
  - JWT errors → `401 Unauthorized`
- All other errors fall back to `500 Internal Server Error` (with stack in non-production).

Response shape on error:
```json
{ "success": false, "message": "…", "errors": [ … ] }
```

---

## Logging

Winston is configured in `utils/logger.js`:
- `logs/error.log` — error-level entries
- `logs/combined.log` — all levels
- Console output in development

HTTP access logging via `morgan('dev')`.

---

## Deployment

### Vercel (serverless)
`vercel.json` routes all traffic to `server.js`. Steps:
1. Set `backend-tailor-app` as the project root in Vercel.
2. Add every environment variable from the table above.
3. Deploy. Note that persistent file logs don't work on serverless — consider a log drain or external sink.

### Traditional host (VPS, Render, Railway, Fly.io)
```bash
npm install
npm start        # or via PM2: pm2 start server.js --name tailor-api
```
Put Nginx or Cloudflare in front for TLS and caching.

### Before going live
- Set `NODE_ENV=production`.
- Use a strong `JWT_SECRET`.
- Change the default admin password.
- Point `MONGO_URI` at a managed database with backups (e.g. MongoDB Atlas).
- Set `FRONTEND_URL` to your deployed frontend URL so tracking links in notifications are correct.

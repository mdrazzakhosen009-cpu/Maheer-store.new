# MAHEER STORE — Full-Stack Skincare Store

Production-oriented e-commerce starter for **MAHEER STORE**. The storefront is a clean skincare-only experience, while `/admin.html` provides a separate admin workspace.

## Stack
- Node.js + Express
- Turso/libSQL for persistent application data
- JWT + bcryptjs authentication
- Multer for product image uploads
- Gemini API through a server-side endpoint for the AI assistant
- Vanilla HTML/CSS/JS frontend (fast and easy to deploy)

## Features
- Responsive premium skincare storefront
- Product search, categories, featured/new products
- Real cart stored in the browser
- Real order creation and stock decrement
- bKash / Nagad / Rocket / Cash on Delivery order methods
- Transaction ID for online payment
- Order IDs like `SAR-XXXXXX` and order tracking
- Customer register/login
- Secure admin login and protected admin API
- Product add/edit/delete + image upload
- Agent add/edit/delete
- Order status management
- Contact/lead storage
- Store/about/social/payment/delivery settings
- Gemini AI chatbot via backend
- Fixed admin login artwork (the supplied MAHEER image)
- No admin logo upload feature
- No discount/offer text

## Local setup
1. Install Node.js 20+.
2. Copy `.env.example` to `.env`.
3. For a quick local run, you may use:
   - `DATABASE_URL=file:maheer.db`
   - leave `TURSO_AUTH_TOKEN` empty
4. For the real deployment, use your Turso URL/token.
5. Set a strong `JWT_SECRET`.
6. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
7. Add `GEMINI_API_KEY` and optionally `GEMINI_MODEL`.
8. Run:
   ```bash
   npm install
   npm start
   ```
9. Store: `http://localhost:10000/`
10. Admin: `http://localhost:10000/admin.html`

## Turso
Create a Turso database and copy its libSQL URL and auth token into:
- `DATABASE_URL`
- `TURSO_AUTH_TOKEN`

The application creates its tables automatically on first start. Product/order/agent/settings/customer data is stored in Turso. Product image files are stored under `public/uploads`, not in Turso.

## Image storage on Render
This project intentionally does **not** store product images in Turso. Uploads are written to `public/uploads`.

Render web-service filesystems are ephemeral unless a persistent disk is attached. For production product uploads, attach a Render persistent disk and mount it so the upload directory survives restarts/redeploys. The app reads `UPLOAD_DIR` (default `public/uploads`).

If you prefer object storage later, replace the Multer storage adapter with Cloudinary/S3-compatible storage without changing the database schema.

## Gemini
The browser never receives the Gemini key. `/api/chat` calls Gemini from the server.

Set:
```env
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.1-flash-lite
```
If the selected model is unavailable for your account, change `GEMINI_MODEL` to a currently available Gemini model.

## Payments
The checkout records the selected method and transaction ID. This is intentionally **not** a fake payment-success flow. It does not claim a transaction is verified by bKash/Nagad/Rocket.

For a real gateway later:
- create a server-side payment adapter
- create a payment session on the server
- verify callbacks/webhooks server-side
- update `payment_status` only after verification

The current COD/manual-transaction flow remains usable without pretending an online payment was verified.

## Render deployment
- Create a Web Service from this repository.
- Build Command: `npm install`
- Start Command: `npm start`
- No Root Directory is required.
- Add all variables from `.env.example`.
- Use a persistent disk for `public/uploads` if admin image uploads must survive deploys/restarts.
- Point the public service to the assigned Render URL.

## Netlify/Vercel
The frontend can be hosted separately, but this project is deliberately packaged as a single Express service so `/api/*`, uploads, admin and storefront share one deployment. For separate frontend hosting, configure the frontend API base URL and deploy the Express backend independently (Render is the simplest option for this structure).

## Admin
Admin is created automatically from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on first start. Change the password from the Security section after logging in.

## Important production checks
- Use a long random `JWT_SECRET`.
- Never commit `.env`.
- Use HTTPS.
- Configure a real Turso database/token.
- Attach persistent storage for local product uploads on Render or replace uploads with object storage.
- Use real payment gateway credentials only on the server.
- Replace demo contact/payment settings before client handoff.

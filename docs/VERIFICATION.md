# Verification and launch status

## Local verification environment

- Node.js 24.15.0, Next.js 16.3.6, React 19.3.0, Prisma 6.19.3.
- Real MySQL 8.4.11, running as the current user in an isolated `/tmp` directory, bound to loopback port 3307. No Docker, root install, external database or storage service.
- Chrome browser tests on the running Next application. Original generated concept imagery optimized to WebP.
- Local `.env` and temporary test credentials are excluded from Git.

## Checks

- `npm install`: successful, lockfile included.
- `npm test`: 8 tests, passing (validation, price stripping, slug handling, bcrypt byte bounds, JSON-LD escaping, MKD formatting, timezone reporting).
- `npm run typecheck`: passing.
- `npm start`: production server started successfully; storefront, shop, product, admin login, robots and sitemap returned HTTP 200.
- Product-card quick add: variant selection and cart drawer verified in Chrome.
- `npm run build`: production build verified; see repository commit/CI for final build.
- `npm run test:integration`: 17 passing real database/API tests for authorization, invalid login, origin protection, invalid checkout, price tampering, idempotency, private confirmations, unavailable products, disabled variants, concurrent stock races, duplicate cart lines, atomic rollback, cancellation restoration, made-to-order workflow, slug uniqueness, safe image uploads, private files, messages and newsletter uniqueness. Also verifies option editing and stable delivered revenue dates.
- `npm run test:browser`: customer home → shop → product → colour → cart → checkout → confirmation; admin login → new product → image upload → option → variant → publish; status changes from NEW through DELIVERED; responsive overflow checks at 1440, 1280, 768 and 390 pixels.
- Dependency audit: no known vulnerabilities reported for the installed tree at verification time.

Screenshots and the machine-readable browser report are generated in ignored `test-results/`. The local image upload test decodes an actual PNG, confirms all three WebP dimensions and downloads the result. Private STL tests confirm an anonymous request cannot retrieve a customer file.

## What still requires your hosting account

The following cannot be represented as completed local tests:

- Deploy the Node app and independent PHP media website in your actual Hostinger account.
- Verify PHP runtime/permissions, HMAC bridge connectivity, account website quota and upload/proxy limits.
- Confirm database access during hPanel's build step (or use the documented account SSH/Remote MySQL migration alternative).
- Run the **upload → GitHub code update → Hostinger redeploy → restart → verify identical media and private file bytes** test in [HOSTINGER-MEDIA.md](HOSTINGER-MEDIA.md).
- Connect your domain and enable HTTPS when available.
- Enter real business details, review legal templates, select delivery/production commitments and replace sample products/concept imagery before taking live orders.
- Verify backups and a staging restore. Choose a retention policy for customer and private design data.

The source is prepared for Hostinger; a local passing build and local upload persistence are not evidence of a successful Hostinger deployment. No external email/SMS service or payment gateway is connected or required. No email messages are sent automatically.

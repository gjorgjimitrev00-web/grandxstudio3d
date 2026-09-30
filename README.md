# GrandXStudio

A full-stack Next.js App Router storefront and studio dashboard for a North Macedonian 3D-printing business. TypeScript, Tailwind CSS, Prisma **MySQL**, and Cash on Delivery. Runtime media stays in the same Hostinger account, outside the Node deployment.

## What is included

- Macedonian storefront with an English interface dictionary and language switch; responsive homepage, searchable catalog, category/price/stock filters, sorting and pagination.
- Product galleries with zoom, colour choices, relational variants, personalized text, stock modes, specifications, related products, and product metadata/structured data.
- Local cart, drawer, guest checkout, live server quote, unique sequential order numbers, private confirmation pages, and optional customer accounts with saved address, order history, password change.
- Server-authorized admin: dashboard, products, variants/options, image upload/order/alt text, categories, orders/status timeline, customer history, private custom-print files, messages, newsletter and settings.
- Atomic order placement, conditional stock decrements, idempotent submissions, cancellation stock restoration, database-backed rate limits, hashed expiring sessions, origin checks, Zod validation and bounded uploads.
- An HMAC-authenticated PHP media bridge for a **separate Hostinger PHP website**. Public images are decoded and optimized to WebP; private design files are served through authenticated admin downloads.

There are no payment gateways, Docker, Redis, Cloudinary, external storage, or external database services. This is a normal persistent Node process, not a static export.

## Local development

Use Node **24 LTS** and MySQL 8.0+ (8.4 LTS tested). Create a database and user using your existing local MySQL tools. No Docker or root access is required by the application.

```sh
npm install
cp .env.example .env
# Edit .env with your MySQL connection and random AUTH_SECRET.
npm run db:migrate
npm run db:seed
npm run admin:create
npm run dev
```

For local uploads, set `MEDIA_DRIVER=local` and an absolute `LOCAL_MEDIA_ROOT` **outside this checkout**, such as `/tmp/grandxstudio-media`. The local driver deliberately refuses production mode. Use the Hostinger bridge for production and production-mode upload tests.

`NEXT_PUBLIC_SITE_URL` must exactly match the origin you open, including localhost versus 127.0.0.1 and the port. It is also the trusted origin for request validation and canonical URLs. Use HTTPS in production.

`db:seed` contains sample products and generated **concept** imagery, not verified inventory. It is idempotent, does not overwrite products, and never creates an admin. Replace sample descriptions, prices, images, dimensions and stock with your real products before selling. Production sample seeding is guarded by `ALLOW_SAMPLE_SEED=true`; do not enable it for a live store.

All prices are integer MKD amounts. No floating-point money calculations are used. Changing the currency display alone is not a currency-conversion feature; admin intentionally accepts MKD only until additional currencies, country validation and shipping rules are implemented.

```sh
npm run build
npm start
```

## HOSTINGER CLOUD STARTUP DEPLOYMENT

Hostinger's official documentation lists Cloud plans as supporting managed Node.js apps, GitHub deployment, Node.js 24, and MySQL. The app targets that service, **not a VPS**.

1. Push this project to your repository: `git@github.com:gjorgjimitrev00-web/grandxstudio3d.git`. Commit source, `package-lock.json`, Prisma schema and migrations. Never commit `.env`, local credentials, `node_modules` or `.next`.
2. In hPanel, create a MySQL database and database user under **Websites → Dashboard → Databases → Management**. Record the exact database host, prefixed database name, username and password. Do not assume localhost if your panel provides another host.
3. Build `DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE?connection_limit=5&pool_timeout=20`. Percent-encode special characters in username/password. Use the host's TLS parameters if required by that connection. Do not disable TLS validation for a remote connection.
4. Generate `AUTH_SECRET` and a **different** `MEDIA_UPLOAD_SECRET`, e.g. run `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` twice on your own computer. Put values only in hPanel environment variables.
5. Configure the persistent media website using [the exact media deployment instructions](docs/HOSTINGER-MEDIA.md). Finish this before testing uploads. You can use temporary Hostinger domains until buying your domain.
6. Add a **Node.js Web App** in hPanel, choose **Connect with GitHub**, authorize the repository, and select the deployment branch. Choose Next.js and the repository root.
7. Choose **Node.js 24.x**. Install with `npm ci` (or Hostinger's detected npm install). Keep development dependencies during the build: Prisma and tsx are build tools. Do not set `NPM_CONFIG_PRODUCTION=true`/omit dev dependencies in the build environment.
8. Add `DATABASE_URL`, `AUTH_SECRET`, `NEXT_PUBLIC_SITE_URL`, `MEDIA_DRIVER=bridge`, `MEDIA_BASE_URL`, `MEDIA_UPLOAD_URL`, `MEDIA_UPLOAD_SECRET`. Use the temporary or final HTTPS website URL as `NEXT_PUBLIC_SITE_URL`, without a trailing slash. Do not set `LOCAL_MEDIA_ROOT` for production.
9. **Build command:** `npm run deploy:build`. It runs `prisma migrate deploy`, the optional first-admin bootstrap, Prisma generation and the Next production build. This supports hPanel deployments without needing an interactive shell. Migration failure stops the build. Back up the database before deploying future schema changes; never use `prisma migrate dev` in production.
10. **Start command:** `npm start`. Select the detected Next.js output (`.next`) if prompted. The app listens on the supplied `PORT`, or 3000 by default. Do not use a static frontend deployment, `output: export`, PM2 or a custom VPS service.
11. For your **first admin**, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` (12+ characters, at most 72 UTF-8 bytes) in hPanel for the first build. The bootstrap creates an admin only when none exists, never resets existing users, and does not log the password. After a successful deployment, **remove both variables and redeploy immediately**. Alternatively run `npm run admin:create` on a trusted environment connected to the database; it prompts for a hidden password.
12. Deploy. Confirm all migrations and the build succeeded in the deployment log. Open `/admin/login`, sign in and enter business details, social links, legal content and shipping settings. Initial standard delivery is 150 MKD, with a 3,000 MKD free-delivery threshold; pickup starts disabled. These are database values you can edit, not hard-coded checkout rules.
13. Add your real products, images, categories, options and variants. Publish only products with accurate information. Make a real staging checkout with Cash on Delivery and verify the customer details in admin. The application does not send confirmation email or SMS; the customer receives the order number and confirmation page in the browser.
14. When you buy your domain, assign it to the Node website in hPanel, configure the DNS records shown there, enable SSL and verify HTTPS. Assign `media.your-domain.mk` to the independent media website. Update the site/media environment URLs and redeploy. Keep the old media hostname or migrate stored image URLs if changing a media hostname after uploads.
15. Verify image uploads **and the mandatory redeployment survival test** below. Check MySQL persistence, private download authorization, mobile checkout, order cancellation and admin access before opening sales.

Production builds use `next build --webpack`, the supported Next.js fallback for the reported Hostinger Turbopack CSS-worker panic (`node process exited before we could connect to it`). Keep hPanel's build command set to `npm run deploy:build` so migrations and admin bootstrap still run. After deploying this change, confirm the build log identifies the bundler as `(webpack)`; a log showing `(Turbopack)` means the deployment is using an older revision or overriding the package script with a direct `next build` command.

The precise hPanel labels and build/runtime network access can vary. Hostinger's managed Business/Cloud service runs npm commands during deployment, not through SSH. If migrations cannot reach MySQL during a build, use a trusted local machine with the same code revision and narrowly allowed Remote MySQL access to run `npm run db:migrate`, then use `npm run build` as the deployment command. Create the admin from that trusted environment with `npm run admin:create` and remove the Remote MySQL allowance afterward. Do not expose a public migration/setup endpoint.

### Official references checked

- [Managed Node.js deployments](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/)
- [Supported Node.js versions](https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/)
- [Hostinger MySQL connection](https://www.hostinger.com/support/connecting-a-hostinger-mysql-database-to-a-node-js-application/)
- [Independent subdomain websites](https://www.hostinger.com/support/1583405-how-to-create-and-delete-subdomains-in-hostinger/)
- [Redeploying a Node application](https://www.hostinger.com/support/how-to-redeploy-a-node-js-application/)

Hostinger documents backend build files outside public_html, but this project does **not** infer a guarantee that arbitrary Node runtime files survive deployment. Independent PHP-site storage is the chosen separation; its behavior still needs verification on your actual account.

## Testing

```sh
npm test
npm run typecheck
npm run build
# Start the app with an isolated, seeded local MySQL database, then:
npm run test:integration
node --import tsx tests/browser-flow.ts
```

Integration tests create temporary fixture accounts/products/orders, exercise real APIs and MySQL, then remove their records. The browser suite currently uses Chrome at the macOS application path; set the executable path for your system or use an installed Playwright Chromium. **Never run these suites against live customer data.** They refuse nonlocal database URLs unless explicitly allowed with `TEST_DATABASE_CONFIRMED=true`.

Coverage includes spoofed frontend prices, empty/negative carts, unavailable products, disabled variants, concurrent inventory purchases, idempotency, cancellation restoration, made-to-order production, forbidden admin access, invalid login, cross-origin writes, real image uploads, private design downloads, newsletter uniqueness, checkout through confirmation, product creation and complete order status progression. See [verification notes](docs/VERIFICATION.md) for actual results and unverified deployment checks.

## Operations and security

- Sessions are random 256-bit tokens; only SHA-256 hashes are stored. Cookies are HTTP-only, SameSite=Lax, Secure in production, and expire after seven days. Password changes revoke all prior sessions. There are no hard-coded admin credentials and no public role assignment.
- Every admin page and API checks the current database-backed role. Mutations require the configured Origin. Rendered content is plain React text, and JSON-LD is escaped against script termination.
- Sequential order numbers are **not authentication**. Confirmation pages require a scoped secure guest cookie or the owning account/admin. Guest order history is not silently claimed by an account with a matching email. The confirmation cookie lasts seven days; customers should save their order number and contact the store if returning from another browser.
- `TRUST_PROXY=false` is safe by default. Limits share a global bucket without trusting spoofable forwarded headers; login also has an email-specific bucket. Set it true only after verifying Hostinger overwrites `X-Forwarded-For` rather than forwarding untrusted values. Tune limits for traffic after this verification. No Redis is used.
- Prices and shipping are recalculated from MySQL. Relational order snapshots preserve names, options, address and prices when catalog records change. Transactions retry transient conflicts; stock changes use conditional updates. Cancellation restores tracked stock once. Delivered/cancelled orders cannot be reopened through the normal workflow.
- Public uploads require an admin, valid MIME/extension and successful image decoding. Originals and EXIF are not retained. Custom design files are private, size limited, never executed/extracted, and delivered as `application/octet-stream` attachments with `nosniff`. Treat downloaded customer files as untrusted and inspect them in your normal isolated design workflow; this project does not include malware scanning.
- Back up the MySQL database and **both public and private media directories**. Code in GitHub is not a backup of orders or uploaded files. Test a restore on staging. Schedule routine session/rate-limit cleanup with the supplied script using an existing hPanel scheduled task if desired.
- Legal templates must be reviewed and populated before sales. No return promises or company identities were invented. Contact details and social links start blank.
- Core interface strings are in `src/lib/i18n.ts`. Admin is English; editable marketing/page content and product records are single-language fields initially. The dictionary allows further UI translations without spreading copy through components; translated catalog records can be added later.

## Project map

| Path                             | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `src/app/(store)`                | Customer pages                                     |
| `src/app/admin`                  | Secure studio management                           |
| `src/app/api/[...path]/route.ts` | Validated HTTP API dispatcher                      |
| `src/lib/checkout.ts`            | Atomic pricing, orders, inventory, status workflow |
| `src/lib/security.ts`            | Authentication, request protection, rate limits    |
| `src/lib/storage.ts`             | Local development / Hostinger media drivers        |
| `prisma/`                        | MySQL schema, migrations, sample seed              |
| `deployment/media/`              | Hostinger PHP media bridge                         |
| `scripts/`                       | First admin and maintenance scripts                |
| `tests/`                         | Unit, real database/API, and browser verification  |

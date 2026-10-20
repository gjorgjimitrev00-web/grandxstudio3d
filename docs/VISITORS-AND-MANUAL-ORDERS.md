# Visitors and manual orders

## Deployment

Use the existing Hostinger build command, `npm run deploy:build`. The additive
`202610200001_visitors_manual_orders` migration creates `VisitorDay`, adds manual
order metadata and indexes, and copies existing orders' `createdAt` into
`orderedAt`. Existing orders remain `ONLINE`. No new npm dependency or analytics
service account is needed. Back up MySQL before the migration.

Check the deployed revision in Hostinger, then sign in to `/admin`. A new
**Visitors** navigation item and **Add order +** action should appear. Earlier
website traffic cannot be reconstructed; counts start after deployment.

## Visitor report

Open **Admin → Visitors** (`/admin/analytics`). It shows estimated unique visitors
for today, visitors located in North Macedonia, other/unknown locations, city
counts and a seven-day trend. Select any date within the retained 35 calendar
days. All days use **Europe/Skopje**, including daylight saving changes.

The first visible storefront visit sends a first-party request to `/api/visits`.
One public IP address and browser user-agent combination counts once per day.
The server stores a daily HMAC, approximate city/country, and first/last visit
times. It never stores raw IP addresses or user agents in the analytics table.
The day is part of the HMAC, so these identifiers cannot be directly joined
across days. No account, order, device ID, page history, or precise location is
attached. Normal server/hosting access logs are separate from this feature.

Counts are estimates: people using the same network and browser can merge;
changing network/browser can count a person again. Signed-in admins, common
bots, private/missing addresses, Do Not Track and Global Privacy Control are
excluded. JavaScript blockers and visitors who opt out will reduce the count.
This is not a fraud-resistant or advertising attribution system.

**Count storefront visitors** pauses new records immediately at the API.
Existing records remain until cleanup. The privacy page includes English and
Macedonian disclosure and a browser opt-out saved in local storage. Browser
privacy signals take precedence over that checkbox.

Records older than 35 local calendar days are deleted on incoming visits and
admin report reads (at most once per hour per process). `npm run maintenance`
also deletes them; run it daily in a trusted environment connected to MySQL.
Deployment does not schedule maintenance. During complete inactivity, expired
rows remain until the next cleanup; they are never shown by the date selector.

### Hosting IP header

The default is `ANALYTICS_IP_HEADER=x-forwarded-for`. Only use a client-IP header
that your reverse proxy strips and overwrites. Supported alternatives are
`x-real-ip` and `cf-connecting-ip`. This setting affects approximate analytics
only and does not change `TRUST_PROXY`, login throttling, or authorization.

The report warns if its current request has no public IP in the configured
header. Verify against the actual Hostinger proxy configuration. A valid-looking
proxy/server address cannot be detected automatically: if all real visits merge
or cities look wrong, verify the header with the host rather than inventing a
location. Do not enable `TRUST_PROXY` just to turn on analytics.

To verify live, have a non-admin browser with privacy blocking disabled visit a
store page, then refresh Visitors. Revisit in the same browser/network: the daily
count should remain unchanged. Localhost visits are deliberately excluded.
Do not send synthetic visits to production to test city counts.

### City estimates and attribution

City lookup runs locally against the bundled North Macedonia subset of
[DB-IP City Lite](https://db-ip.com/db/download/ip-to-city-lite), licensed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). No visitor IP is sent to
DB-IP or another geolocation service. Mobile carriers and VPNs may place a
visitor in a different city. Unmatched addresses are **other / unknown**, not
confirmed foreign traffic.

The release is displayed in the report. To refresh public network data:

```sh
node --import tsx scripts/update-city-data.ts YYYY-MM
```

Review and commit `src/data/macedonia-cities.json`, then redeploy. Keep DB-IP
attribution in the report/privacy page and `src/data/README.md`.

## Recording an in-person order

1. Open **Admin → Orders → Add order +** (`/admin/orders/new`).
2. Choose shop products and variants or write a custom item name. Enter quantity
   and the **actual agreed unit price in whole MKD**, after any discount.
3. Keep **Deduct tracked stock** checked for a new sale. Untick it when entering
   an older sale whose stock was already adjusted. Custom items never change
   inventory. Required personalization can be recorded in item details.
4. Choose in-person/pickup or delivery. Walk-in customer details are optional.
   Delivery requires name, phone, address and city; enter the agreed delivery fee.
5. Choose the sale date, status and actual payment method. A completed sale
   defaults to **Payment already received**; untick it if payment is still due.
   Pending orders are unpaid until handed over and payment is confirmed.
6. Save. The order has the normal GX order number and appears alongside website
   orders. Filter **Manual / in person** to find these sales.

Payment methods only record cash, bank transfer, an external card payment, cash
on delivery, or other payment. This form never charges a customer.

Manual orders snapshot item names, prices and details, and record who entered
them. The sale date can differ from entry time. Customer accounts are not
automatically linked, and manual orders neither earn nor spend reward points.
Campaign discounts are not added automatically; use the agreed price.

Tracked inventory is decremented in the same transaction as creation. Competing
orders cannot take the same last stock. Cancellation restores only stock this
order deducted, once. Completed orders remain final; record product refunds
from the order page. After an uncertain network response, retry the unchanged
form or check Orders before entering a new sale; duplicate submission keys
return the original order instead of creating another one.

## Paid revenue

The dashboard totals **completed (`DELIVERED`) orders with a confirmed payment**,
from both channels, minus recorded cumulative product refunds. Delivery fees
are included. The month also shows website and manual revenue separately.
These are sales totals, not profit or a full accounting ledger.

Reports use payment dates in Europe/Skopje. A manual sale saved as paid uses the
selected historical sale date. A payment confirmed later uses the confirmation
date. A later product refund reduces the original payment period. Delivery
refunds are not currently recorded by the product-refund control.

Previously delivered orders without a recorded payment are now excluded from
**Paid revenue**. Confirm payment on those order pages only if it was actually
received. Cancellation, unpaid orders and unconfirmed COD receipts do not
increase the revenue totals.

## Verification

Use a disposable local MySQL database and local app, both with matching
`DATABASE_URL` and `NEXT_PUBLIC_SITE_URL`. Set `TEST_BASE_URL` for the integration
runner to that app. Never run these tests against customer data.

```sh
npm test
npm run typecheck
node --import tsx --test tests/integration/manual-visitors.test.ts
npm run build
```

Tests cover money/date validation, DST, concurrent retries, overselling,
cancellation, backdated payments, refunds, online-order compatibility, daily
visitor deduplication, city ranges, retention, admin access, origin checks,
privacy signals and the tracking switch.

# City lookup data

`macedonia-cities.json` is a modified subset of [DB-IP IP to City Lite](https://db-ip.com/db/download/ip-to-city-lite),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Attribution: [IP Geolocation by DB-IP](https://db-ip.com/).

Only North Macedonia IPv4/IPv6 ranges and city names are retained. Coordinates and
all other countries are removed. A missing match means **other or unknown**, not a
confirmed foreign visitor. City estimates can be wrong, especially with VPNs and
mobile carriers. This file contains public network allocation data, not visitor records.

Refresh the monthly release and commit the resulting small file:

```sh
node --import tsx scripts/update-city-data.ts YYYY-MM
```

The updater streams the public compressed CSV and validates ranges before replacing
the local file. Production requests use the bundled data and do not contact DB-IP
or transmit visitor IP addresses to any geolocation provider.

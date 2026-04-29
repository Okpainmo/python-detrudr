# Traffic Simulation

This readme describes how to simulate traffic to any server on which you're deploying `detrudr` - using the
`traffic-simulation` setup provided in this directory.

The `traffic-simulation` setup uses K6 by Grafana Labs.

## How To Simulate Traffic.

1. Install K6.

Use this link to find the K6 installation that matches your environment.

> (https://grafana.com/docs/k6/latest/set-up/install-k6/)[https://grafana.com/docs/k6/latest/set-up/install-k6/]

2. Run the simulation.

```bash
cd traffic-simulation
k6 run main.js
```

## The `main.js` file

```js
import http from 'k6/http';
import { sleep, check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 10 }, // warm up
    { duration: '3m', target: 50 }, // light load
    { duration: '3m', target: 100 }, // moderate load
    { duration: '3m', target: 200 }, // heavy load
    { duration: '2m', target: 0 }, // cool down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'], // fail if >5% errors
    http_req_duration: ['p(95)<3000'], // fail if p95 > 3s
  },
};

export default function () {
  let res = http.get('your-domain-sub-domain-or-ip:port');
  check(res, { 'status 200': (r) => r.status === 200 });
  sleep(1 + Math.random() * 2); // randomize think time
}
```

The `main.js` file is a simple K6 script that simulates traffic to a given URL. It uses the `http` module to make HTTP requests to the specified URL and the `sleep` module to simulate think time between requests. The `check` module is used to check if the HTTP requests were successful. The `options` object is used to configure the simulation.

> Feel free to learn more about K6 configurations, and tweak the `main.js` file to suit your needs.

'use client';

import type { ReactNode } from 'react';
import { startTransition, useEffect, useEffectEvent, useState } from 'react';

type DashboardPayload = {
  service: string;
  uptime_seconds: number;
  last_seen_at: string | null;
  global_requests_per_second: number;
  top_source_ips: Array<{
    ip: string;
    rate: number;
    errors: number;
  }>;
  banned_ips: Array<{
    ip: string;
    condition: string;
    rate: number;
    baseline: number;
    banned_at: string;
    duration_label: string;
    expires_at: string | null;
    iptables_applied: boolean;
  }>;
  baselines: Record<
    string,
    {
      mean: number;
      stddev: number;
      sample_count: number;
      source_hour: number | null;
      recalculated_at: string;
    }
  >;
  baseline_history: Array<{
    metric: string;
    timestamp: string;
    effective_mean: number;
    effective_stddev: number;
    sample_count: number;
    source_hour: number | null;
  }>;
  recent_audit: Array<{
    timestamp: string;
    action: string;
    ip: string;
    condition: string;
    rate: number;
    baseline: number;
    duration: string;
    line: string;
  }>;
  totals: {
    requests: number;
    errors: number;
  };
  system: {
    cpu_percent: number;
    memory_percent: number;
  };
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL_BASE ?? 'http://localhost:8000';

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours}h ${minutes}m ${remainingSeconds}s`;
}

function formatTimestamp(value: string | null) {
  if (!value) return 'No events yet';
  return new Date(value).toLocaleString();
}

function buildGraph(history: DashboardPayload['baseline_history']) {
  const globalHistory = history.filter((entry) => entry.metric === 'global_rate').slice(-18);
  const maxValue = Math.max(...globalHistory.map((entry) => entry.effective_mean), 1);

  return globalHistory.map((entry) => {
    const width = `${Math.max((entry.effective_mean / maxValue) * 100, 6)}%`;
    return {
      ...entry,
      width,
    };
  });
}

export default function DashboardConsole() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useEffectEvent(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/dashboard`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Dashboard request failed with ${response.status}`);
      }

      const payload = (await response.json()) as DashboardPayload;
      startTransition(() => {
        setData(payload);
        setError(null);
        setIsLoading(false);
      });
    } catch (fetchError) {
      startTransition(() => {
        setError(
          fetchError instanceof Error ? fetchError.message : 'Unable to load metrics',
        );
        setIsLoading(false);
      });
    }
  });

  useEffect(() => {
    void fetchDashboard();
    const interval = window.setInterval(() => {
      void fetchDashboard();
    }, 3000);

    return () => window.clearInterval(interval);
  }, []);

  const graphBars = buildGraph(data?.baseline_history ?? []);

  return (
    <main className='min-h-screen bg-white px-4 py-6 md:px-8 md:py-8'>
      <div
        className='fixed inset-0 pointer-events-none opacity-60'
        style={{
          backgroundImage:
            'linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className='relative mx-auto max-w-7xl space-y-6'>
        <header className='border border-black/20 bg-white'>
          <div className='flex flex-col gap-5 border-b border-black/20 px-5 py-5 md:flex-row md:items-end md:justify-between'>
            <div>
              <div className='mb-4 flex items-center gap-2'>
                <div className='flex h-6 w-6 items-center justify-center bg-black text-[10px] font-bold tracking-widest text-white'>
                  D
                </div>
                <span className='text-sm font-semibold uppercase tracking-[0.2em] text-black'>
                  Detrudr
                </span>
              </div>
              <h1 className='text-3xl font-semibold tracking-tight text-black md:text-4xl'>
                Traffic anomaly console
              </h1>
              <p className='mt-2 max-w-2xl text-sm tracking-wide text-black/60'>
                Live detector telemetry for the Nextcloud edge. Polling every 3 seconds.
              </p>
            </div>

            <div className='grid grid-cols-2 gap-3 md:min-w-[340px]'>
              <MetricChip label='Service' value={data?.service ?? 'detector'} />
              <MetricChip
                label='Status'
                value={error ? 'degraded' : isLoading ? 'loading' : 'online'}
              />
              <MetricChip
                label='Uptime'
                value={data ? formatUptime(data.uptime_seconds) : '--'}
              />
              <MetricChip
                label='Last event'
                value={data ? formatTimestamp(data.last_seen_at) : '--'}
              />
            </div>
          </div>

          {error ? (
            <div className='px-5 py-3 text-sm tracking-wide text-black'>
              API error: {error}
            </div>
          ) : null}
        </header>

        <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
          <StatCard
            eyebrow='Traffic'
            title='Global req/s'
            value={data?.global_requests_per_second?.toFixed(2) ?? '--'}
            detail='60-second sliding window'
          />
          <StatCard
            eyebrow='Load'
            title='CPU'
            value={data ? `${data.system.cpu_percent.toFixed(1)}%` : '--'}
            detail='Instant host usage'
          />
          <StatCard
            eyebrow='Memory'
            title='RAM'
            value={data ? `${data.system.memory_percent.toFixed(1)}%` : '--'}
            detail='Process host memory'
          />
          <StatCard
            eyebrow='Events'
            title='Requests / errors'
            value={
              data
                ? `${data.totals.requests.toLocaleString()} / ${data.totals.errors.toLocaleString()}`
                : '--'
            }
            detail='Since process start'
          />
        </section>

        <section className='grid gap-4 xl:grid-cols-[1.3fr_0.9fr]'>
          <Panel title='Top source IPs' subtitle='Highest request rates in the current 60-second window'>
            <div className='space-y-2'>
              {data?.top_source_ips.length ? (
                data.top_source_ips.map((item, index) => (
                  <div
                    key={item.ip}
                    className='grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 border border-black/15 px-3 py-3 text-sm'
                  >
                    <span className='font-mono text-black/45'>{String(index + 1).padStart(2, '0')}</span>
                    <span className='font-mono text-black'>{item.ip}</span>
                    <span className='font-mono text-black/65'>{item.rate.toFixed(2)} req/s</span>
                    <span className='font-mono text-black/45'>{item.errors.toFixed(2)} err/s</span>
                  </div>
                ))
              ) : (
                <EmptyState copy='No IP activity has been observed yet.' />
              )}
            </div>
          </Panel>

          <Panel title='Banned IPs' subtitle='Active blocks and their release windows'>
            <div className='space-y-2'>
              {data?.banned_ips.length ? (
                data.banned_ips.map((item) => (
                  <div key={item.ip} className='border border-black/15 px-3 py-3 text-sm'>
                    <div className='flex items-center justify-between gap-3'>
                      <span className='font-mono text-black'>{item.ip}</span>
                      <span className='text-[11px] font-semibold uppercase tracking-[0.15em] text-black/55'>
                        {item.duration_label}
                      </span>
                    </div>
                    <p className='mt-2 font-mono text-[12px] leading-5 text-black/65'>
                      {item.condition}
                    </p>
                    <div className='mt-3 flex flex-wrap gap-3 font-mono text-[12px] text-black/55'>
                      <span>rate {item.rate}</span>
                      <span>baseline {item.baseline}</span>
                      <span>{item.iptables_applied ? 'iptables applied' : 'iptables skipped'}</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState copy='No IP bans are active.' />
              )}
            </div>
          </Panel>
        </section>

        <section className='grid gap-4 xl:grid-cols-[1fr_1fr]'>
          <Panel title='Effective baselines' subtitle='Current mean, stddev and source hour per metric'>
            <div className='space-y-2'>
              {data && Object.keys(data.baselines).length ? (
                Object.entries(data.baselines).map(([metric, baseline]) => (
                  <div
                    key={metric}
                    className='grid gap-2 border border-black/15 px-3 py-3 text-sm md:grid-cols-[1.1fr_0.7fr_0.7fr_0.7fr]'
                  >
                    <div>
                      <div className='text-[11px] font-semibold uppercase tracking-[0.15em] text-black/45'>
                        Metric
                      </div>
                      <div className='mt-1 font-mono text-black'>{metric}</div>
                    </div>
                    <div>
                      <div className='text-[11px] font-semibold uppercase tracking-[0.15em] text-black/45'>
                        Mean
                      </div>
                      <div className='mt-1 font-mono text-black'>{baseline.mean.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className='text-[11px] font-semibold uppercase tracking-[0.15em] text-black/45'>
                        Stddev
                      </div>
                      <div className='mt-1 font-mono text-black'>{baseline.stddev.toFixed(2)}</div>
                    </div>
                    <div>
                      <div className='text-[11px] font-semibold uppercase tracking-[0.15em] text-black/45'>
                        Hour slot
                      </div>
                      <div className='mt-1 font-mono text-black'>
                        {baseline.source_hour ?? 'fallback'}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState copy='Baseline values will appear after samples accumulate.' />
              )}
            </div>
          </Panel>

          <Panel title='Baseline graph' subtitle='Recent effective mean values for the global baseline'>
            <div className='space-y-2'>
              {graphBars.length ? (
                graphBars.map((entry) => (
                  <div key={`${entry.metric}-${entry.timestamp}`} className='space-y-1'>
                    <div className='flex items-center justify-between text-[11px] uppercase tracking-[0.15em] text-black/45'>
                      <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      <span>hour {entry.source_hour ?? '--'}</span>
                    </div>
                    <div className='h-9 border border-black/15 bg-black/[0.03] p-1'>
                      <div className='flex h-full items-center bg-black px-2 text-[11px] font-semibold tracking-[0.15em] text-white' style={{ width: entry.width }}>
                        {entry.effective_mean.toFixed(2)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState copy='Graph data will populate after baseline recalculations run.' />
              )}
            </div>
          </Panel>
        </section>

        <Panel title='Audit log' subtitle='Most recent baseline, ban and unban actions'>
          <div className='space-y-2'>
            {data?.recent_audit.length ? (
              data.recent_audit.map((entry) => (
                <div key={`${entry.timestamp}-${entry.action}-${entry.ip}`} className='border border-black/15 px-3 py-3'>
                  <pre className='overflow-x-auto whitespace-pre-wrap font-mono text-[12px] leading-5 text-black'>
                    {entry.line}
                  </pre>
                </div>
              ))
            ) : (
              <EmptyState copy='No audit entries written yet.' />
            )}
          </div>
        </Panel>
      </div>
    </main>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className='border border-black/20 bg-white'>
      <div className='border-b border-black/20 px-5 py-4'>
        <p className='text-[12px] font-semibold uppercase tracking-[0.15em] text-black/45'>
          {title}
        </p>
        <p className='mt-2 text-sm tracking-wide text-black/60'>{subtitle}</p>
      </div>
      <div className='px-5 py-5'>{children}</div>
    </section>
  );
}

function StatCard({
  eyebrow,
  title,
  value,
  detail,
}: {
  eyebrow: string;
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <article className='border border-black/20 bg-white px-5 py-5'>
      <p className='text-[11px] font-semibold uppercase tracking-[0.15em] text-black/45'>
        {eyebrow}
      </p>
      <h2 className='mt-5 text-sm uppercase tracking-[0.15em] text-black/55'>{title}</h2>
      <p className='mt-2 font-mono text-3xl text-black'>{value}</p>
      <p className='mt-4 text-sm tracking-wide text-black/60'>{detail}</p>
    </article>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div className='border border-black/15 px-3 py-3'>
      <div className='text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45'>
        {label}
      </div>
      <div className='mt-2 font-mono text-[12px] leading-5 text-black'>{value}</div>
    </div>
  );
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className='border border-dashed border-black/20 px-3 py-6 text-sm tracking-wide text-black/50'>
      {copy}
    </div>
  );
}

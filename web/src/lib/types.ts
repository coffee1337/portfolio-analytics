export type Metric = "visits" | "visitors" | "engaged" | "pageviews" | "goals" | "avg_sec";

export interface Filters {
  range: string;
  from?: string;
  to?: string;
  me?: boolean;
  bots?: boolean;
  source?: string;
  utm?: string;
  country?: string;
  city?: string;
  isp?: string;
  device?: string;
  os?: string;
  browser?: string;
  path?: string;
  project?: string;
  goal?: string;
  engaged?: boolean;
}

export interface KpiBlock {
  value: number;
  delta: number | null;
  [key: string]: number | null;
}

export interface Kpi {
  visitors: { value: number; delta: number | null; visits: number; returning: number; returning_pct: number };
  engaged: { value: number; rate: number; delta: number | null };
  bounce: { value: number; count: number; delta: number | null };
  duration: { value: number; max: number; delta: number | null };
  pageviews: { value: number; avg_scroll: number; delta: number | null };
  goals: { value: number; sessions: number; conversion_rate: number; delta: number | null };
}

export interface Point {
  t: string;
  label: string;
  visits: number;
  visitors: number;
  engaged: number;
  pageviews: number;
  goals: number;
  avg_sec: number;
}

export interface Row {
  key: string;
  sessions?: number;
  share?: number;
  count?: number;
  country?: string;
  asn?: string;
  datacenter?: boolean;
  source?: string;
  medium?: string;
  campaign?: string;
}

export interface SessionItem {
  sid: string;
  visitor: string;
  start: string;
  end: string;
  duration: number;
  pageviews: number;
  pages: string[];
  max_scroll: number;
  sections: number;
  goals: string[];
  projects: string[];
  country: string;
  region: string;
  city: string;
  asn: string;
  isp: string;
  ip_masked: string;
  ip_hash: string;
  is_datacenter: boolean;
  is_me: boolean;
  is_bot: boolean;
  device: string;
  os: string;
  browser: string;
  screen: string;
  viewport: string;
  tz: string;
  lang: string;
  referrer: string;
  source: string;
  utm: { source: string; medium: string; campaign: string };
  entry_path: string;
  title: string;
  engaged: boolean;
  bounce: boolean;
  live: boolean;
  visit_index: number;
}

export interface Overview {
  meta: {
    generated_at: string;
    range: string;
    from: string;
    to: string;
    bucket: string;
    tz: string;
    truncated: boolean;
    bots_hidden: number;
    me_hidden: number;
    live: number;
    events_5min: number;
    total_sessions: number;
  };
  kpi: Kpi;
  prev: Record<string, number> | null;
  timeseries: { bucket: string; points: Point[] };
  funnel: {
    home_sessions: number;
    loader: { complete: number; skip: number; complete_pct: number; skip_pct: number };
    steps: { key: string; sessions: number; share: number; drop: number; complete?: number; skip?: number }[];
  };
  projects: {
    id: string;
    select: number;
    details: number;
    case_page: number;
    github: number;
    demo: number;
    clone_copy: number;
    score: number;
    weight: number;
  }[];
  goals: {
    key: string;
    sessions: number;
    events: number;
    share: number;
    topics: Record<string, number>;
    networks: Record<string, number>;
    cards: Record<string, number>;
  }[];
  stack: { key: string; count: number }[];
  stack_modes: Record<string, number>;
  assistant: {
    opens: number;
    asks: number;
    questions: { ts: string; session: string; lang: string; query: string; via: string }[];
  };
  cmdk: { opens: number; commands: { command: string; group: string; count: number }[] };
  acquisition: { sources: Row[]; utm: Row[] };
  geo: { countries: Row[]; cities: Row[]; isps: Row[] };
  devices: { types: Row[]; os: Row[]; browsers: Row[]; screens: Row[] };
  preferences: { languages: Row[]; themes: Row[] };
  paths: { entry: Row[]; all: Row[] };
  sessions: { total: number; page: number; per_page: number; items: SessionItem[] };
}

export interface SessionDetail {
  session: SessionItem;
  events: {
    id: number;
    ts: string;
    name: string;
    path: string;
    title: string;
    gap: number;
    props: Record<string, unknown>;
  }[];
  visitor: { id: string; sessions: number };
}

export interface VisitorDetail {
  visitor: {
    id: string;
    first_seen: string;
    last_seen: string;
    sessions: number;
    active_sec: number;
    is_me: boolean;
    is_bot: boolean;
    goals: { key: string; count: number }[];
    projects: { key: string; count: number }[];
    stack: { key: string; count: number }[];
    countries: string[];
    isp: string;
  };
  sessions: SessionItem[];
}

export interface IgnoredItem {
  id: number;
  kind: string;
  value: string;
  label: string;
  created_at: string;
  events: number;
}

export interface CleanupPreview {
  bots: number;
  me: number;
  total: number;
  ignored: number;
}

export interface MeInfo {
  authenticated: boolean;
  auth_enabled: boolean;
  site_key: string;
  now: string;
}

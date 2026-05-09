// .claude/skills/12306/scripts/common.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const BASE_URL = "https://kyfw.12306.cn";
export const SKILL_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const COOKIE_PATH = join(homedir(), ".12306", "cookies.json");

const HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "zh-CN,zh;q=0.9",
  "Origin": BASE_URL,
  "Referer": BASE_URL + "/",
};

export type Cookies = Record<string, string>;

export function loadCookies(): Cookies {
  if (!existsSync(COOKIE_PATH)) return {};
  try {
    return JSON.parse(readFileSync(COOKIE_PATH, "utf-8"));
  } catch {
    return {};
  }
}

export function saveCookies(cookies: Cookies): void {
  try {
    const dir = dirname(COOKIE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(COOKIE_PATH, JSON.stringify(cookies, null, 2));
  } catch (e) {
    log(`Warning: failed to persist cookies: ${e}`);
  }
}

function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of header.split(",")) {
    const kv = part.trim().split(";")[0].trim();
    const eq = kv.indexOf("=");
    if (eq > 0) result[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
  return result;
}

export function createSession() {
  let cookies: Cookies = loadCookies();

  async function request(
    url: string,
    options: { method?: string; body?: string | URLSearchParams; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    const headers: Record<string, string> = {
      ...HEADERS,
      ...(options.headers ?? {}),
      Cookie: cookieStr,
    };
    if (options.body instanceof URLSearchParams) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
    }

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const resp = await fetch(url, {
          method: options.method ?? "GET",
          headers,
          body: options.body instanceof URLSearchParams ? options.body.toString() : options.body,
          redirect: "follow",
        });
        // Merge Set-Cookie
        const setCookie = resp.headers.get("set-cookie");
        if (setCookie) Object.assign(cookies, parseCookieHeader(setCookie));
        return resp;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  return {
    get: (url: string, opts?: { headers?: Record<string, string> }) =>
      request(url, { method: "GET", ...opts }),
    post: (url: string, body?: URLSearchParams | string, opts?: { headers?: Record<string, string> }) =>
      request(url, { method: "POST", body, ...opts }),
    getCookies: () => cookies,
    setCookies: (c: Cookies) => { cookies = { ...cookies, ...c }; },
    persistCookies: () => saveCookies(cookies),
  };
}

export function outputOk(data: unknown): never {
  process.stdout.write(JSON.stringify({ ok: true, data }) + "\n");
  process.exit(0);
}

export function outputError(msg: string): never {
  process.stderr.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  process.exit(1);
}

export function log(msg: string): void {
  process.stderr.write(msg + "\n");
}

export function getStationCode(name: string): string {
  const stationsPath = join(SKILL_DIR, "assets", "stations.txt");
  let content: string;
  try {
    content = readFileSync(stationsPath, "utf-8");
  } catch {
    outputError(`stations.txt not found at ${stationsPath}`);
  }
  const entries = content!.replace(/^@/, "").split("@");
  for (const entry of entries) {
    const parts = entry.split("|");
    if (parts[1] === name) return parts[2];
  }
  throw new Error(`Station not found: ${name}`);
}

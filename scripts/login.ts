// .claude/skills/12306/scripts/login.ts
import { createSession, outputOk, outputError, log, BASE_URL } from "./common.ts";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

const args = process.argv.slice(2);
let QR_PATH = join(homedir(), ".12306", "qrcode.png");
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--qr-path" && args[i + 1]) {
    QR_PATH = args[i + 1];
    break;
  }
}

const session = createSession();

async function downloadQrcode(): Promise<{ uuid: string; imageB64: string } | null> {
  const body = new URLSearchParams({ appid: "otn" });
  const resp = await session.post(BASE_URL + "/passport/web/create-qr64", body);
  const data = await resp.json() as { result_code?: string; uuid?: string; image?: string };
  if (data.result_code !== "0" || !data.uuid || !data.image) return null;
  return { uuid: data.uuid, imageB64: data.image };
}

async function checkqr(uuid: string): Promise<{ code: string; uamtk?: string }> {
  const body = new URLSearchParams({
    RAIL_DEVICEID: session.getCookies()["RAIL_DEVICEID"] ?? "",
    RAIL_EXPIRATION: session.getCookies()["RAIL_EXPIRATION"] ?? "",
    uuid,
    appid: "otn",
  });
  const resp = await session.post(BASE_URL + "/passport/web/checkqr", body);
  const data = await resp.json() as { result_code?: string; uamtk?: string };
  return { code: String(data.result_code ?? ""), uamtk: data.uamtk };
}

async function authUamtk(): Promise<string | null> {
  for (let i = 0; i < 5; i++) {
    const body = new URLSearchParams({ appid: "otn" });
    const resp = await session.post(BASE_URL + "/passport/web/auth/uamtk", body, {
      headers: { Referer: BASE_URL + "/otn/passport?redirect=/otn/login/userLogin" },
    });
    const data = await resp.json() as { newapptk?: string };
    if (data.newapptk) return data.newapptk;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return null;
}

async function authUamauthclient(tk: string): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    try {
      const body = new URLSearchParams({ tk });
      const resp = await session.post(BASE_URL + "/otn/uamauthclient", body);
      const data = await resp.json() as { username?: string };
      if (data.username) return data.username;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return null;
}

// --- Main login flow ---

log("请用 12306 APP 扫码（二维码有效期约 20 秒，请尽快）");

const qr = await downloadQrcode();
if (!qr) outputError("获取二维码失败");

const buffer = Buffer.from(qr.imageB64, "base64");
if (existsSync(QR_PATH)) unlinkSync(QR_PATH);
const dir = dirname(QR_PATH);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
writeFileSync(QR_PATH, buffer);
log(`二维码已保存: ${QR_PATH}`);

// Short poll matching QR expiry
const start = Date.now();
const maxWait = 20_000;
let lastCode = "";

while (Date.now() - start < maxWait) {
  await new Promise((r) => setTimeout(r, 1000));

  const { code } = await checkqr(qr.uuid);
  lastCode = code;

  if (code === "2") {
    log("扫码确认成功");
    break;
  } else if (code === "3") {
    log("二维码已过期");
    break;
  } else if (code === "0") {
    process.stderr.write(`\r  等待扫码... (${Math.floor((Date.now() - start) / 1000)}s)  `);
  } else if (code === "1") {
    process.stderr.write(`\r  已扫码，请在 APP 确认...  `);
  }
}

if (lastCode !== "2") {
  outputError(lastCode === "3" ? "二维码已过期，请重试" : "扫码超时，请重试");
}

// --- 认证流程：线性调用 ---

await session.get(BASE_URL + "/otn/login/userLogin");

let tk: string | null;
try {
  tk = await authUamtk();
} catch (e: unknown) {
  outputError(`auth/uamtk 请求失败: ${e instanceof Error ? e.message : String(e)}`);
}
if (!tk) outputError("获取 newapptk 失败");

let username: string | null;
try {
  username = await authUamauthclient(tk!);
} catch (e: unknown) {
  outputError(`uamauthclient 请求失败: ${e instanceof Error ? e.message : String(e)}`);
}
if (!username) outputError("认证失败");

// Verify
await session.get(BASE_URL + "/otn/login/userLogin");
const verifyResp = await session.get(BASE_URL + "/otn/login/conf");
const verifyData = await verifyResp.json() as { data?: { is_login?: string } };
if (verifyData?.data?.is_login !== "Y") outputError("登录验证失败");

session.persistCookies();
log("Cookie 已保存: ~/.12306/cookies.json");
outputOk({ username });

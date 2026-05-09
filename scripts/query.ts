// .claude/skills/12306/scripts/query.ts
import { createSession, outputOk, outputError, getStationCode, BASE_URL } from "./common.ts";

// Seat field indices in pipe-delimited response
const SEAT_IDX: Record<number, string> = {
  32: "商务座", 25: "特等座", 31: "一等座", 30: "二等座",
  28: "硬卧", 23: "软卧", 29: "硬座", 26: "无座",
};
const PRICE_CODES: Record<string, string> = {
  "9": "商务座", "P": "特等座", "M": "一等座", "O": "二等座",
  "A": "硬座", "W": "无座", "3": "硬卧", "4": "软卧",
};

// order.ts seat code → seat name (for --seat filter)
const ORDER_SEAT_CODES: Record<string, string> = {
  "O": "二等座", "M": "一等座", "9": "商务座", "P": "特等座",
  "1": "硬座", "3": "硬卧", "4": "软卧",
};

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const fromStation = get("--from");
  const toStation = get("--to");
  const date = get("--date");
  if (!fromStation || !toStation || !date) {
    outputError("必须提供 --from, --to, --date");
  }
  return {
    fromStation: fromStation!,
    toStation: toStation!,
    date: date!,
    periodFrom: get("--period-from") ?? null,
    periodTo: get("--period-to") ?? null,
    trainTypes: new Set((get("--train-types") ?? "G,D,C").split(",")),
    seatFilter: get("--seat") ?? null,
  };
}

const args = parseArgs();

let fromCode: string, toCode: string;
try {
  fromCode = getStationCode(args.fromStation);
  toCode = getStationCode(args.toStation);
} catch (e: unknown) {
  outputError(e instanceof Error ? e.message : String(e));
}

const session = createSession();

// Discover API type
const initResp = await session.get(BASE_URL + "/otn/leftTicket/init");
const initText = await initResp.text();
const apiMatch = initText.match(/var\s+CLeftTicketUrl\s*=\s*'([^']+)'/);
if (!apiMatch) {
  outputError("无法获取查询接口类型");
}
const apiType = apiMatch![1];

// Query
const queryUrl = `${BASE_URL}/otn/${apiType}?leftTicketDTO.train_date=${args.date}&leftTicketDTO.from_station=${fromCode}&leftTicketDTO.to_station=${toCode}&purpose_codes=ADULT`;
const queryResp = await session.get(queryUrl);
let queryData: { data?: { result?: string[]; map?: Record<string, string> } };
try {
  queryData = await queryResp.json();
} catch {
  outputError("查询响应解析失败（可能未登录）");
}

const results = queryData!.data?.result ?? [];
const stationMap = queryData!.data?.map ?? {};

const periodFrom = args.periodFrom ? timeToMinutes(args.periodFrom) : null;
const periodTo = args.periodTo ? timeToMinutes(args.periodTo) : null;
const allowedSeats = args.seatFilter
  ? new Set(args.seatFilter.split(",").map(c => ORDER_SEAT_CODES[c]).filter(Boolean))
  : null;

const trains = [];
for (const r of results) {
  const f = r.split("|");
  const train = f[3];
  if (!args.trainTypes.has(train[0])) continue;

  const leftTime = f[8];
  if (!leftTime) continue;
  const minutes = timeToMinutes(leftTime);
  if (periodFrom !== null && minutes < periodFrom) continue;
  if (periodTo !== null && minutes > periodTo) continue;

  if (f[11] !== "Y" || f[1] !== "预订") continue;

  // Filter: exact station (杭州东→杭州东 only) or city prefix (杭州→杭州东/杭州南/杭州)
  const fromName = stationMap[f[6]] ?? f[6];
  const toName = stationMap[f[7]] ?? f[7];
  if (!fromName.startsWith(args.fromStation) || !toName.startsWith(args.toStation)) continue;

  // Parse price from field 39
  const prices: Record<string, number> = {};
  const priceField = f[39] ?? "";
  const priceMatches = priceField.matchAll(/([A-Z0-9])(\d{5})(\d{3,5})/g);
  for (const m of priceMatches) {
    const p = parseInt(m[2]) / 10;
    if (p > 10 && PRICE_CODES[m[1]]) prices[PRICE_CODES[m[1]]] = p;
  }

  const availableSeats: Record<string, { count: string; price?: number }> = {};
  for (const [idx, name] of Object.entries(SEAT_IDX)) {
    const val = f[Number(idx)] ?? "";
    if (!val || val === "无" || val === "*") continue;
    if (allowedSeats && !allowedSeats.has(name)) continue;
    availableSeats[name] = {
      count: val,
      ...(prices[name] != null && { price: prices[name] }),
    };
  }
  if (Object.keys(availableSeats).length === 0) continue;

  trains.push({
    train,
    depart_time: leftTime,
    arrive_time: f[9],
    duration: f[10],
    from_station: fromName,
    to_station: toName,
    secret: f[0],
    train_no: f[2],
    seats: availableSeats,
    price: Object.values(availableSeats).reduce(
      (min, s) => s.price != null && (min === 0 || s.price < min) ? s.price : min, 0
    ),
    seat_selectable: true,
  });
}

outputOk({ trains });
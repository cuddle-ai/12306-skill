// .claude/skills/12306/scripts/order.ts
import { createSession, outputOk, outputError, log, BASE_URL } from "./common.ts";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const secret = get("--secret");
  const trainDate = get("--train-date");
  const fromName = get("--from-name");
  const toName = get("--to-name");
  const seat = get("--seat");
  const passenger = get("--passenger");
  if (!secret || !trainDate || !fromName || !toName || !seat || !passenger) {
    outputError("必须提供 --secret, --train-date, --from-name, --to-name, --seat, --passenger");
  }
  return {
    secret: secret!,
    trainDate: trainDate!,
    fromName: fromName!,
    toName: toName!,
    seat: seat!,
    passenger: passenger!,
    seatPosition: get("--seat-position") ?? "",
  };
}

function formatTrainDate(date: string): string {
  const d = new Date(date + "T00:00:00+08:00");
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${days[d.getDay()]} ${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")} ${d.getFullYear()} 00:00:00 GMT+0800 (China Standard Time)`;
}

const a = parseArgs();
const session = createSession();

// Step 1: submitOrderRequest
log("[1/6] 提交订单请求...");
const submitBody = new URLSearchParams({
  secretStr: decodeURIComponent(a.secret),
  train_date: a.trainDate,
  back_train_date: a.trainDate,
  tour_flag: "dc",
  purpose_codes: "ADULT",
  query_from_station_name: a.fromName,
  query_to_station_name: a.toName,
});
const submitResp = await session.post(BASE_URL + "/otn/leftTicket/submitOrderRequest", submitBody);
const submitData = await submitResp.json() as { data?: unknown; messages?: unknown };
if (String(submitData.data) !== "0") {
  const msg = Array.isArray(submitData.messages)
    ? (submitData.messages as string[]).join("; ")
    : String(submitData.messages ?? "提交失败");
  if (String(msg).includes("过期")) {
    outputError(JSON.stringify({ type: "SECRET_EXPIRED", message: String(msg) }));
  }
  outputError(`提交订单失败: ${msg}`);
}
session.persistCookies();

// Step 2: initDc
log("[2/6] 获取表单数据...");
const initBody = new URLSearchParams({ _json_att: "" });
const initResp = await session.post(BASE_URL + "/otn/confirmPassenger/initDc", initBody);
const initHtml = await initResp.text();
if (initHtml.includes("系统忙")) {
  outputError("系统繁忙");
}
const tokenMatch = initHtml.match(/var globalRepeatSubmitToken = '(.+?)'/);
const formMatch = initHtml.match(/var ticketInfoForPassengerForm\s*=\s*(\{.+?\});/s);
if (!tokenMatch || !formMatch) {
  outputError("未找到 token 或表单数据");
}
const token = tokenMatch![1];
let formData: Record<string, unknown>;
try {
  formData = new Function("return " + formMatch![1])() as Record<string, unknown>;
} catch (e: unknown) {
  outputError(`表单数据解析失败: ${e instanceof Error ? e.message : String(e)}`);
}

// Step 3: getPassengerDTOs + build strings
log("[3/6] 构造乘客信息...");
const paxResp = await session.post(BASE_URL + "/otn/confirmPassenger/getPassengerDTOs");
const paxData = await paxResp.json() as { data?: { normal_passengers?: Array<Record<string, string>> } };
const allPax = paxData?.data?.normal_passengers ?? [];
if (allPax.length === 0) {
  outputError("无乘客数据");
}
const names = a.passenger.split(",").map((n) => n.trim());
const selected = names.map((name) => {
  const p = allPax.find((x) => x.passenger_name === name);
  if (!p) {
    outputError(`未找到乘客: ${name}`);
  }
  return p!;
});
const ticketParts = selected.map((p) =>
  `${a.seat},0,${p.passenger_type},${p.passenger_name},${p.passenger_id_type_code},${p.passenger_id_no},${p.mobile_no},N,${p.allEncStr}`
);
const oldParts = selected.map((p) =>
  `${p.passenger_name},${p.passenger_id_type_code},${p.passenger_id_no},${p.passenger_type}`
);
const passengerTicketStr = ticketParts.join("_");
const oldPassengerStr = oldParts.join("_") + "__ _ _";

// Step 4: checkOrderInfo
log("[4/6] 校验订单...");
const checkBody = new URLSearchParams({
  cancel_flag: "2",
  bed_level_order_num: "000000000000000000000000000000",
  passengerTicketStr,
  oldPassengerStr,
  tour_flag: "dc",
  randCode: "",
  whatsSelect: "1",
  _json_att: "",
  REPEAT_SUBMIT_TOKEN: token,
});
const checkResp = await session.post(BASE_URL + "/otn/confirmPassenger/checkOrderInfo", checkBody);
const checkData = await checkResp.json() as { data?: { submitStatus?: boolean; errMsg?: string } };
if (!checkData?.data?.submitStatus) {
  outputError(`订单校验失败: ${checkData?.data?.errMsg ?? ""}`);
}

// Step 5: getQueueCount
log("[5/6] 排队查询...");
const dto = (formData!.queryLeftTicketRequestDTO as Record<string, string>);
const queueBody = new URLSearchParams({
  train_date: formatTrainDate(a.trainDate),
  train_no: dto.train_no,
  stationTrainCode: dto.station_train_code,
  seatType: a.seat,
  fromStationTelecode: dto.from_station,
  toStationTelecode: dto.to_station,
  leftTicket: String(formData!.leftTicketStr),
  purpose_codes: String(formData!.purpose_codes),
  train_location: String(formData!.train_location),
  _json_att: "",
  REPEAT_SUBMIT_TOKEN: token,
});
const queueResp = await session.post(BASE_URL + "/otn/confirmPassenger/getQueueCount", queueBody);
const queueData = await queueResp.json() as { status?: boolean; data?: { op_2?: string } };
if (!queueData.status) {
  outputError("排队查询失败");
}
if (queueData.data?.op_2 === "true") {
  outputError("余票不足");
}

// Step 6: confirmSingleForQueue
log("[6/6] 确认下单...");
const confirmBody = new URLSearchParams({
  passengerTicketStr,
  oldPassengerStr,
  randCode: "",
  purpose_codes: String(formData!.purpose_codes),
  key_check_isChange: String(formData!.key_check_isChange),
  leftTicketStr: String(formData!.leftTicketStr),
  train_location: String(formData!.train_location),
  choose_seats: a.seatPosition,
  seatDetailType: "000",
  whatsSelect: "1",
  roomType: "00",
  dwAll: "N",
  _json_att: "",
  REPEAT_SUBMIT_TOKEN: token,
});
const confirmResp = await session.post(BASE_URL + "/otn/confirmPassenger/confirmSingleForQueue", confirmBody);
const confirmData = await confirmResp.json() as { data?: { submitStatus?: boolean; errMsg?: string } };
if (!confirmData?.data?.submitStatus) {
  outputError(`确认下单失败: ${confirmData?.data?.errMsg ?? ""}`);
}

// Poll queryOrderWaitTime
log("等待出票...");
const start = Date.now();
while (Date.now() - start < 60000) {
  await new Promise((r) => setTimeout(r, 3000));
  const waitUrl = `${BASE_URL}/otn/confirmPassenger/queryOrderWaitTime?random=${Math.random().toString().slice(2)}&tourFlag=dc&_json_att=&REPEAT_SUBMIT_TOKEN=${encodeURIComponent(token)}`;
  const waitResp = await session.get(waitUrl);
  const waitData = await waitResp.json() as { status?: boolean; data?: { orderId?: string; waitTime?: number; waitCount?: number; msg?: string } };
  if (waitData.status && waitData.data) {
    const { orderId, waitTime, msg } = waitData.data;
    if (orderId) {
      session.persistCookies();
      outputOk({ order_id: orderId });
    }
    const wt = Number(waitTime ?? 0);
    if (wt === -2 || wt === -3) {
      outputError(`出票失败: ${msg ?? ""}`);
    }
    if (wt >= 0) {
      log(`排队中... waitCount=${waitData.data.waitCount ?? 0} waitTime=${wt}s`);
    }
  }
}
outputError("等待出票超时");

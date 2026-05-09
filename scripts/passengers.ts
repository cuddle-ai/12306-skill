// .claude/skills/12306/scripts/passengers.ts
import { createSession, outputOk, outputError, BASE_URL } from "./common.ts";

const PASSENGER_TYPE_MAP: Record<string, string> = {
  "1": "成人", "2": "儿童", "3": "学生", "4": "残军",
};

const session = createSession();

let resp: Response;
try {
  resp = await session.post(BASE_URL + "/otn/confirmPassenger/getPassengerDTOs");
} catch (e: unknown) {
  outputError(`请求失败: ${e instanceof Error ? e.message : String(e)}`);
}

const data = await resp.json() as {
  data?: { normal_passengers?: Array<Record<string, string>> };
  messages?: string;
};

const passengers = data?.data?.normal_passengers ?? [];
if (passengers.length === 0) {
  const msg = data?.messages ?? "";
  outputError(msg ? `获取乘客列表失败: ${msg}` : "无乘客数据");
}

const result = passengers.map((p) => ({
  name: p.passenger_name ?? "",
  type: PASSENGER_TYPE_MAP[p.passenger_type ?? ""] ?? p.passenger_type ?? "",
}));

outputOk({ passengers: result });

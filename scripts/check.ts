// .claude/skills/12306/scripts/check.ts
import { createSession, outputOk, outputError, BASE_URL } from "./common.ts";

const session = createSession();

try {
  const resp = await session.get(BASE_URL + "/otn/login/conf");
  const data = await resp.json() as { data?: { is_login?: string; is_uam_login?: string; name?: string } };
  const isLogin = data?.data?.is_login === "Y";
  if (!isLogin) {
    outputError("未登录");
  }
  outputOk({ username: data?.data?.name ?? "", login: true });
} catch (e: unknown) {
  outputError(`请求失败: ${e instanceof Error ? e.message : String(e)}`);
}

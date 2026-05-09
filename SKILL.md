---
name: "12306"
description: "查询和购买中国铁路 12306 火车票。触发词：买票、查票、余票、高铁、动车、火车票、12306、购票、抢票。支持查询余票、查看乘客列表、提交订单。"
---

# 12306 购票助手

Bun 脚本完成 12306 火车票查询和购买。

## User Input Tools

When this skill prompts the user, follow this tool-selection rule (priority order):

1. **Prefer built-in user-input tools** exposed by the current agent runtime — e.g., `AskUserQuestion`, or any equivalent.
2. **Fallback**: if no such tool exists, emit a numbered plain-text message and ask the user to reply with the chosen number/answer.
3. **Batching**: if the tool supports multiple questions per call, combine all applicable questions into a single call.

## Script Directory

`{baseDir}` = this SKILL.md's directory (the repo root after installation).
Resolve `${BUN_X}`: prefer `bun`; else `npx -y bun`; else suggest `brew install oven-sh/bun/bun`.

> **First-time setup:** if `{baseDir}/scripts/node_modules/` does not exist, run `cd {baseDir}/scripts && bun install` before using any script.

## Step 0: Load Preferences [BLOCKING]

This step MUST complete before any ticket operation.

1. Check `$HOME/.12306/EXTEND.md` for preferences and scenes.
2. **Found** -> load preferences + scenes. Apply as defaults.
3. **Not found** -> run first-time setup (`references/config/first-time-setup.md`).

**Load priority:** user dialog input > scene override > preferences > script defaults.

## Output Format

All scripts output JSON:
- Success: `{"ok": true, "data": {...}}` -> stdout, exit 0
- Failure: `{"ok": false, "error": "..."}` -> stderr, exit 1
- Progress logs -> stderr (does not affect JSON parsing)

## Usage

```bash
# Check login
${BUN_X} {baseDir}/scripts/check.ts

# Login (if check fails, agent auto-calls this)
${BUN_X} {baseDir}/scripts/login.ts

# Query tickets
${BUN_X} {baseDir}/scripts/query.ts --from "北京南" --to "上海虹桥" --date 2026-05-07

# List passengers
${BUN_X} {baseDir}/scripts/passengers.ts

# Place order
${BUN_X} {baseDir}/scripts/order.ts \
  --secret "<from query result>" \
  --train-date 2026-05-07 --from-name "北京南" --to-name "上海虹桥" \
  --seat O --passenger "张三" --seat-position "1F"
```

## Options

### query.ts

| Flag | Required | Description |
|------|----------|-------------|
| `--from` | Yes | 出发站（中文站名） |
| `--to` | Yes | 到达站（中文站名） |
| `--date` | Yes | 出发日期 (YYYY-MM-DD) |
| `--period-from` | No | 时段起始 (HH:mm) |
| `--period-to` | No | 时段截止 (HH:mm) |
| `--train-types` | No | 车次类型，逗号分隔 |
| `--seat` | No | 座位类型编码，逗号分隔。编码见 `references/seat-codes.md` |

### order.ts

| Flag | Required | Description |
|------|----------|-------------|
| `--secret` | Yes | 从 query 结果获取 |
| `--train-date` | Yes | 出发日期 (YYYY-MM-DD) |
| `--from-name` | Yes | 出发站（用 query 结果的 `from_station`） |
| `--to-name` | Yes | 到达站（用 query 结果的 `to_station`） |
| `--seat` | Yes | 座位编码。编码见 `references/seat-codes.md` |
| `--passenger` | Yes | 乘客姓名，多人逗号分隔 |
| `--seat-position` | No | 选座。格式 `{序号}{字母}`，如 `1F` |

## Workflow

### 1. Scene Matching

If user input contains a scene name from EXTEND.md `scenes` (e.g., "回家", "出差上海"), use that scene's fields to pre-fill the clarification dialog. Otherwise, use only `preferences` for defaults.

### 2. Clarification Dialog (single AskUserQuestion, 4 questions at once)

**Must always clarify before querying.** Preferences/scenes only provide default values.

AskUserQuestion with all 4 questions in one call:

- Q1: 出发站 (default from scene `from_station` or leave empty)
- Q2: 到达站 (default from scene `to_station` or leave empty)
- Q3: 出发日期 (required, no default)
- Q4: 时段 (options: 上午/下午/全天, default from scene `period_from`/`period_to`)

User confirms/modifies -> proceed to query. No second confirmation needed.

### 3. Query Tickets

```bash
${BUN_X} {baseDir}/scripts/query.ts \
  --from "<from_station>" --to "<to_station>" --date <date> \
  --period-from <period_from> --period-to <period_to> --train-types <train_types>
```

Use confirmed values from clarification dialog. `train_types` from preferences.

### 4. Display Results with Recommendations

Sort trains by `sort_priority` from preferences:
- `duration` -> ascending by duration (fastest first)
- `price` -> ascending by price (cheapest first)
- `departure_time` -> ascending by depart time (earliest first)

Display as table:

| 车次 | 出发-到达 | 历时 | 座位余量 | 价格 | 标记 |
|------|-----------|------|----------|------|------|

Top 3 sorted trains get "推荐" tag. Remaining trains shown in API original order.

### 5. Select Train, Seat, and Passengers

User specifies train number. Seat type defaults to `seat_type` from preferences (can override). Seat position defaults to `seat_position` from preferences (can override).

If passenger not specified:
- If scene has `passengers` -> use those
- Otherwise:

```bash
${BUN_X} {baseDir}/scripts/passengers.ts
```

Seat position: 靠窗 -> A/F, 过道 -> C/D. Details in `references/seat-codes.md`.

### 6. Check Login (before order only)

Query does not require login. Login is only needed before placing an order.

```bash
${BUN_X} {baseDir}/scripts/check.ts
```

- `ok: true` -> proceed to order
- `ok: false` -> **auto-call login.ts**, do NOT ask user to run commands manually:

```bash
${BUN_X} {baseDir}/scripts/login.ts
```

**MUST dispatch login.ts to a subagent (`login-worker`) so the main agent can show the QR code in parallel without being blocked.** The script has a 5-10s delay before fetching the QR, and the QR expires in ~20s. The main agent MUST NOT run login.ts itself — it must delegate to a subagent and concurrently show the QR code.

**Login procedure (follow exactly, do not deviate):**

1. Tell the user: "请在 12306 APP 准备扫码"
2. Generate a unique QR file path: `QR_PATH=~/.12306/qrcode_$(date +%s).png`
3. **Step 3A and 3B MUST execute in parallel in a single message** (two tool calls in one response). Both use the same `QR_PATH` value generated in step 2:

   **3A. Dispatch subagent `login-worker`** (Agent tool):
   - `description`: `"login-worker"`
   - `prompt`: `"Run the following command and report the full stdout JSON result: ${BUN_X} {baseDir}/scripts/login.ts --qr-path <QR_PATH>"`

   **3B. Poll for QR code** (Bash tool, runs concurrently in main agent):
   ```bash
   while [ ! -f <QR_PATH> ]; do sleep 1; done
   ```

4. Once QR file appears from step 3B, the **next message MUST be the QR code image** — read `<QR_PATH>` and display it immediately. No other text or actions before showing the QR. Tell the user to scan now.
5. Wait for subagent `login-worker` to complete. Parse the result:
   - Success (`ok: true, data: { username }`) -> proceed to order
   - Failure -> inform user, ask if they want to retry

> **CRITICAL:**
> - login.ts is a single-run atomic flow. Each execution creates a new session. Re-running mid-flow **destroys the current session**.
> - **DO NOT** run login.ts again while the subagent is still running. Wait for it to finish first.
> - **DO NOT** run login.ts in the main agent. It MUST be delegated to a subagent (`login-worker`).
> - Step 3A and 3B are parallel — the subagent runs login.ts while the main agent waits for the QR file. This is essential because the QR code expires in ~20s.
> - The unique `QR_PATH` avoids race conditions with stale QR files from previous login attempts.

### 7. Confirm and Order

**Must confirm all details with user before ordering.** Show: train, date, passengers, seat type, seat position, price.

```bash
${BUN_X} {baseDir}/scripts/order.ts \
  --secret "<from query>" --train-date <date> \
  --from-name "<from_station>" --to-name "<to_station>" \
  --seat <code> --passenger "<name>" --seat-position "<position>"
```

**Secret expiry**: if order returns "车票信息已过期", auto re-query for new secret, then retry order.

### 8. Report Result

Success:
> 下单成功，订单号 {orderId}。请在 {payDeadline} 前完成支付（以 12306 APP 显示为准）。

`payDeadline` = current time + 20 minutes.

Failure: error message + suggest retry.

## Scene Management

**Adding scenes**: User says "添加场景" or "保存场景" -> collect scene name, from_station, to_station, period, passengers via AskUserQuestion (single call) -> append to EXTEND.md `scenes`.

**Matching rule**: User input text contains a scene key from `scenes` -> match.

## Error Handling

- Not logged in (order step) -> auto-call login.ts
- Secret expired -> auto re-query, retry order
- System busy ("系统忙") -> inform user, suggest retry later
- Order failed (non-expiry) -> inform user, do NOT auto-retry
- Network error -> scripts auto-retry 3 times internally

## References

| File | Content |
|------|---------|
| `references/config/preferences-schema.md` | EXTEND.md schema |
| `references/config/first-time-setup.md` | First-time setup flow |
| `references/seat-codes.md` | Seat type codes and position mapping |

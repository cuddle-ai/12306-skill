---
name: first-time-setup
description: First-time setup - collect preferences then optionally create a scene
---

# First-Time Setup

## Trigger

EXTEND.md 不存在时触发（Step 0 in SKILL.md）。

## Step 0: Quick Setup or Skip

AskUserQuestion:

```yaml
header: "偏好设置"
question: "是否要进行偏好设置？"
options:
  - label: "快速设置 (Recommended)"
    description: "4 个问题，约 30 秒，下次查票更省心"
  - label: "跳过"
    description: "使用默认设置，以后可随时配置"
```

If "跳过": write minimal EXTEND.md (`preferences: {}`), confirm "已跳过偏好设置，后续可随时配置", then continue with ticket workflow.

If "快速设置": proceed to Step 1.

## Step 1: Collect Preferences

AskUserQuestion（单次调用，4 个问题）：

### Q1: 座位偏好

```yaml
header: "座位类型"
question: "你偏好哪种座位？"
options:
  - label: "二等座 (Recommended)"
    description: "经济实惠，默认选择"
  - label: "一等座"
    description: "更宽敞舒适"
  - label: "商务座"
    description: "最高舒适度"
```

Map: 二等座 -> O, 一等座 -> M, 商务座 -> 9.

### Q2: 选座偏好

```yaml
header: "选座偏好"
question: "你有选座偏好吗？"
options:
  - label: "靠窗"
    description: "A 或 F"
  - label: "过道"
    description: "C 或 D"
  - label: "不限"
    description: "不指定座位位置"
```

Map: 靠窗 -> F, 过道 -> C, 不限 -> null.

### Q3: 车次类型

```yaml
header: "车次类型"
question: "偏好哪些车次类型？"
options:
  - label: "高铁动车 (Recommended)"
    description: "G, D, C"
  - label: "仅高铁"
    description: "仅 G"
  - label: "全部"
    description: "所有类型"
```

Map: 高铁动车 -> "G,D,C", 仅高铁 -> "G", 全部 -> null.

### Q4: 排序策略

```yaml
header: "排序策略"
question: "查询结果如何排序？"
options:
  - label: "历时优先 (Recommended)"
    description: "最快的车次排在前面"
  - label: "价格优先"
    description: "最便宜的排在前面"
  - label: "出发时间优先"
    description: "最早出发的排在前面"
```

Map: 历时优先 -> duration, 价格优先 -> price, 出发时间优先 -> departure_time.

## Step 2: Create Scene (Optional)

AskUserQuestion:

```yaml
header: "场景模板"
question: "是否要创建一个常用场景模板？（如「回家」「出差」）"
options:
  - label: "创建"
    description: "设置常用路线，下次说「回家」即可快速查票"
  - label: "跳过"
    description: "以后再设置"
```

If "创建":

AskUserQuestion（单次调用，5 个问题）：

```yaml
Q1:
  header: "场景名称"
  question: "给这个场景起个名字？（如：回家、出差上海）"

Q2:
  header: "出发站"
  question: "出发站是哪个？"

Q3:
  header: "到达站"
  question: "到达站是哪个？"

Q4:
  header: "时段"
  question: "偏好哪个时段？"
  options:
    - label: "上午 08-12"
    - label: "下午 12-18"
    - label: "全天 06-23"

Q5:
  header: "乘客"
  question: "常用乘客姓名？（多人逗号分隔，可留空）"
```

Map period: 上午 -> "08:00"/"12:00", 下午 -> "12:00"/"18:00", 全天 -> null/null.

## Step 3: Save Location

## Step 4: Write EXTEND.md

Write to `$HOME/.12306/EXTEND.md`. Only set fields the user provided; use defaults for the rest.

Example (user chose 二等座, 靠窗, 高铁动车, 历时优先, created 「回家」scene):

```yaml
---
preferences:
  seat_type: "O"
  seat_position: "F"
  train_types: "G,D,C"
  sort_priority: "duration"
scenes:
  回家:
    from_station: "杭州东"
    to_station: "宁波"
    period_from: "08:00"
    period_to: "12:00"
---
```

## Install Dependencies (first time only)

If `scripts/node_modules/` does not exist, run:

```bash
cd {baseDir}/scripts && bun install
```

This installs `pngjs` (used for QR code rendering). Only needed once after installation.

## After Setup

1. Create directory if needed
2. Write EXTEND.md
3. Confirm: "偏好已保存至 {path}"
4. Continue with ticket workflow

## Adding Scenes Later

用户说「添加场景」「保存场景」时触发：

AskUserQuestion（单次，5 个问题，同 Step 2 的场景创建流程）收集参数后追加到 EXTEND.md 的 `scenes` 下。

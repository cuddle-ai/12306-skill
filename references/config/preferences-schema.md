---
name: preferences-schema
description: EXTEND.md YAML schema - 通用偏好 + 场景模板
---

# EXTEND.md Schema

## YAML Template

```yaml
---
# 通用偏好 - 跨场景通用的个人习惯
preferences:
  seat_type: "O"            # 座位编码 (O=二等座, M=一等座, 9=商务座)
  seat_position: "F"        # 选座字母 (A-F), F=靠窗右侧
  train_types: "G,D,C"      # 车次类型，逗号分隔
  sort_priority: "duration"  # duration | price | departure_time

# 场景模板 - 固定部分参数，可覆盖通用偏好
scenes:
  回家:
    from_station: "杭州东"
    to_station: "宁波"
    period_from: "08:00"
    period_to: "12:00"
    passengers: ["张三"]
---
```

## Preferences Fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `seat_type` | string | "O" | 座位编码。O=二等座, M=一等座, 9=商务座。完整编码见 seat-codes.md |
| `seat_position` | string | null | 选座偏好字母。F=靠窗, A=靠窗左, C/D=过道。详见 seat-codes.md |
| `train_types` | string | "G,D,C" | 逗号分隔的车次类型前缀 |
| `sort_priority` | string | "duration" | 推荐排序策略: duration / price / departure_time |

## Scene Fields

场景中可包含以下字段，未列出的偏好字段从 preferences 继承：

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `from_station` | string | Yes | 出发站（中文站名） |
| `to_station` | string | Yes | 到达站（中文站名） |
| `period_from` | string | No | 查询起始时间，格式 HH:mm |
| `period_to` | string | No | 查询截止时间，格式 HH:mm |
| `passengers` | string[] | No | 默认乘客姓名列表 |
| `seat_type` | string | No | 覆盖通用座位编码 |
| `seat_position` | string | No | 覆盖通用选座偏好 |
| `train_types` | string | No | 覆盖通用车次类型 |

## Load Priority

用户对话输入 > 场景覆盖字段 > 通用偏好 > 脚本默认值


---
id: foundation
name: 四要素基础卡
summary: 每镜必填的「拍什么」地基层——时间/空间/人物/事件；11 域轴是「怎么拍」。缺本卡，方向词将失去世界语义。
# ---- 机器锚：泛型校验器（src/adapters/seedance/foundation.ts）只读这里，代码零写死 ----
required:
  - path: time.period
    kind: string
    label: 时段（如「放学傍晚」）
  - path: space.location
    kind: string
    label: 地点（场景名）
  - path: space.geometry.roadDirection
    kind: string
    label: 道路在画内的走向
  - path: space.camera.side
    kind: string
    label: 相机方位（如「道路右侧、镜头朝道路深处」）
  - path: space.traffic.screenPath
    kind: string
    label: 主体动线（屏幕路径）
  - path: characters
    kind: array
    label: 出镜人物数组（空镜可为空，who 用「环境」）
  - path: characters[].id
    kind: string
    label: 角色编号（A/B/C…）
  - path: characters[].ref
    kind: string
    label: 角色规范名（引用 wiki/material 实体名）
  - path: characters[].facing
    kind: string
    label: 朝向（世界方向，如「向画面深处」）
  - path: characters[].motion
    kind: string
    label: 动作（如「推车缓行」）
  - path: characters[].props
    kind: optionalStringArray
    label: 随身持有物（「道具名（状态）」数组，不携带可缺省）
  - path: events
    kind: arrayNonEmpty
    label: 事件序列（至少 1 个）
  - path: events[].seq
    kind: number
    label: 事件序号（1 起，唯一）
  - path: events[].who
    kind: stringArray
    label: 事件主体（角色 id 数组，可含「环境」「镜头」）
  - path: events[].action
    kind: string
    label: 事件动作
enums:
  space.geometry.roadDirection: [depth, lateral, none]
  space.traffic.screenPath: [toward-camera, away-from-camera, left-to-right, right-to-left, static, mixed]
  "characters[].position.screen": [left, right, center, whole]
  "characters[].position.depth": [front, mid, back, none]
conflicts:
  - when: [space.geometry.roadDirection==depth, space.traffic.screenPath==left-to-right]
    message: 空间几何冲突：道路画内纵深（roadDirection=depth）与横向动线（screenPath=left-to-right）矛盾——成片会呈现「横穿马路」违和。二选一：动线改 toward-camera/away-from-camera（沿路走），或 roadDirection 改 lateral（道路横铺、侧拍构图）。
  - when: [space.geometry.roadDirection==depth, space.traffic.screenPath==right-to-left]
    message: 空间几何冲突：道路画内纵深（roadDirection=depth）与横向动线（screenPath=right-to-left）矛盾——成片会呈现「横穿马路」违和。二选一：动线改 toward-camera/away-from-camera（沿路走），或 roadDirection 改 lateral（道路横铺、侧拍构图）。
  - when: [space.geometry.roadDirection==lateral, space.traffic.screenPath==toward-camera]
    message: 空间几何冲突：道路画内横向铺开（roadDirection=lateral）与纵深动线（screenPath=toward-camera）矛盾——「沿路走」与画内道路走向不符。二选一：动线改 left-to-right/right-to-left，或 roadDirection 改 depth。
  - when: [space.geometry.roadDirection==lateral, space.traffic.screenPath==away-from-camera]
    message: 空间几何冲突：道路画内横向铺开（roadDirection=lateral）与纵深动线（screenPath=away-from-camera）矛盾——「沿路走」与画内道路走向不符。二选一：动线改 left-to-right/right-to-left，或 roadDirection 改 depth。
reservedWho: [环境, 镜头]
zh:
  space.geometry.roadDirection:
    depth: 道路画内纵深
    lateral: 道路画内横向铺开
    none: 无明确道路走向
  space.traffic.screenPath:
    toward-camera: 向镜头走近
    away-from-camera: 向画面深处走远
    left-to-right: 自画面左向右行进
    right-to-left: 自画面右向左行进
    static: 原地不动
    mixed: 多段动线
  characters[].position.screen:
    left: 画左
    right: 画右
    center: 画中
    whole: 画面整体
  characters[].position.depth:
    front: 前景
    mid: 中景
    back: 背景
    none: 无纵深标定
example:
  time:
    period: 放学傍晚
    lightState: 夕阳暖光、斑驳树影
    sequence: 连续（与上一镜同一时段）
  space:
    location: 校园梧桐林荫道
    geometry:
      roadDirection: depth
    camera:
      side: 道路右侧、镜头朝道路深处
      axis: 角色A恒画左、角色B恒画右
    traffic:
      screenPath: away-from-camera
      note: 两人沿路向画面深处走远
    layers:
      supporting: 角色B
      foreground: 前景梧桐叶虚化
      background: 成排梧桐
      environment: 放学人流稀疏
  characters:
    - id: A
      ref: 回眸少女
      position: { screen: left, depth: mid }
      facing: 向画面深处
      motion: 推车缓行
  events:
    - seq: 1
      who: [A]
      action: 推车沿路行进
      durationSecs: 4
    - seq: 2
      who: [A]
      action: 停下回眸微笑
      durationSecs: 1
---

# 四要素基础卡（foundation）

任何镜头都先回答「拍什么」再谈「怎么拍」：**时间、空间、人物、事件**。11 域轴（景别/机位/…）是拍法翻译层，本卡是它们的地基——没有本卡的几何，方向词（「沿林荫道走」「画面左侧」）就是没有世界语义的空转。

## 各要素要点

- **time**：时段（`period` 必填）+ 光线状态（`lightState`）+ 时间顺序（`sequence`：连续/跳跃 + 与前后镜关系）。→ 框定 lighting/color 的合法域。
- **space**：地点 + 道路走向（`geometry.roadDirection`，**纵深 depth / 横铺 lateral / none**）+ 相机方位与 180° 轴线（`camera`）+ 动线（`traffic.screenPath`）+ 五层次（`layers`：主体陪体前景背景环境各有什么）。
- **characters**：编号（id）→ 角色（ref，引用 `material/` 实体名或 wiki 规范名）→ **画面位**（position.screen=画左/画右/画中/整体 + position.depth=前景/中景/背景）→ 朝向（facing）→ 动作（motion）。多人戏必须每人写死画面位（跨镜一致 = 输入一致）。
- **events**：编号动作序列（seq 1..N = 镜头内时间线），事件主体（who 引用角色 id 或「环境/镜头」）。一镜只讲一个信息落点。

## 持有物（characters[].props）

- 人物随身携带的道具在 `props` 声明为「名（状态）」数组：`["银灰色旧单车（全程推行：行驶/停靠/续行均不离手）"]`。
- **事件序列的每个动作段必须重述持有状态**：尾段动作写「并肩走远（A 推着车）」，不写「并肩走远」——历史事故：S006 尾段丢车，人走了车留在原地。
- 不携带道具缺省该字段；道具的外观锚与跨镜一致性走 material 道具档案（共识门控），不在 foundation 复制一份。

## 方向词纪律（先世界后屏幕）

- 屏幕方向（画面左/右、走近/走远）只是 **世界方向的投影**：先定世界（路往哪走、人往哪去、相机在哪、轴怎么定），再写屏幕词。
- 「沿路走」必须依赖 roadDirection 先成立：`depth` → 动线只能 toward-camera / away-from-camera；`lateral` → 动线只能 left-to-right / right-to-left。冲突组合会被 generate_shot **硬拦**（历史事故：S005「道路纵深 + 横穿动线」，见故事 corrections）。
- 180° 轴线写进 `camera.axis`（如「角色A恒画左、角色B恒画右」），双人戏开工前过检。

## 反例（为什么必须有这张卡）

> 事故①：S005 一镜到底成片「路是垂直的，人物却水平横穿马路」——提示词写了「沿林荫道」+「向画面右侧」，两个空间指令互相矛盾，模型任选其一交差。
> 事故②：S002–S004 三镜连戏「衔接人物位置和上一镜相反」——三镜只有一镜写了画面位，位置定义从未入列。

两起事故的机器解都在本卡：冲突表拦 ①；characters[].position 必填拦 ②。
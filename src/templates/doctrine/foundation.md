---
id: foundation
name: 基础面卡（景→人→交互→动线）
summary: 每镜必填的「拍什么」地基层——先立景（舞台三锚+机位+时辰），再入人（身份/骨架比例/站位），再定交互（接触/遮挡/尺度/恒存），最后可选加动线（事件序列）；11 域轴是「怎么拍」。缺本卡，方向词将失去世界语义。
# ---- 机器锚：泛型校验器（src/adapters/seedance/foundation.ts）只读这里，代码零写死 ----
required:
  # —— 景块（必填·先立） ——
  - path: scene.location
    kind: string
    label: 场景地点
  - path: scene.period
    kind: string
    label: 光照时辰（时段+光线状态，如「放学傍晚·夕阳暖光」）
  - path: scene.anchors.ground
    kind: string
    label: 地面锚（地面实体，如「柏油人行道」）
  - path: scene.anchors.lightSource
    kind: string
    label: 光源锚（主光方向与性质，如「夕阳自左侧逆光」）
  - path: scene.anchors.scaleRef
    kind: string
    label: 尺度参照锚（人-景尺度比参照物，如「成排梧桐·等距灯柱」）
  - path: scene.geometry.roadDirection
    kind: string
    label: 道路在画内的走向
  - path: scene.camera.side
    kind: string
    label: 相机世界方位（如「道路右侧、镜头朝道路深处」）
  - path: scene.traffic.screenPath
    kind: string
    label: 主体动线（屏幕路径）
  # —— 人块（必填·空镜可为空数组） ——
  - path: characters
    kind: array
    label: 出镜人物数组（空镜可为空，who 用「环境」）
  - path: characters[].id
    kind: string
    label: 角色编号（A/B/C…）
  - path: characters[].ref
    kind: string
    label: 角色规范名（引用 wiki/material 实体名）
  - path: characters[].proportions
    kind: string
    label: 骨架比例（相对参照系描述：相对身高 / 头身比 / 与道具比例）
  - path: characters[].facing
    kind: string
    label: 朝向（世界方向，如「向画面深处」）
  - path: characters[].motion
    kind: string
    label: 动作（如「推车缓行」）
  - path: characters[].props
    kind: optionalStringArray
    label: 随身持有物（「道具名（状态）」数组，不携带可缺省）
  # —— 交互块（必填·景律与人律对齐处） ——
  - path: interaction.groundContact
    kind: string
    label: 接触落地（脚与地面、阴影接地点）
  - path: interaction.occlusion
    kind: string
    label: 遮挡前后（人物与前景背景的前后关系）
  - path: interaction.scaleRatio
    kind: string
    label: 人-景尺度比（人物与参照物的尺寸关系）
  - path: interaction.propStates
    kind: string
    label: 道具恒存态（随身/在场/离手——道具归属声明）
  # —— 动线块（可选·静态/无状态变化镜头可整块缺省） ——
  - path: timeline.events
    kind: arrayNonEmpty
    label: 事件序列（至少 1 个）
  - path: timeline.events[].seq
    kind: number
    label: 事件序号（1 起，唯一）
  - path: timeline.events[].who
    kind: stringArray
    label: 事件主体（角色 id 数组，可含「环境」「镜头」）
  - path: timeline.events[].action
    kind: string
    label: 事件动作
optionalBlocks: [timeline]
propRestateMessage: 事件《{{action}}}》未重述 {{ch}} 的持有物「{{prop}}」——动线中该角色出场的每个事件动作都必须重述持有状态（历史事故：S006 人走后车留原地）。把「{{prop}}」写进动作描述或修正道具状态后重提。
enums:
  scene.geometry.roadDirection: [depth, lateral, none]
  scene.traffic.screenPath: [toward-camera, away-from-camera, left-to-right, right-to-left, static, mixed]
  "characters[].position.screen": [left, right, center, whole]
  "characters[].position.depth": [front, mid, back, none]
conflicts:
  - when: [scene.geometry.roadDirection==depth, scene.traffic.screenPath==left-to-right]
    message: 空间几何冲突：道路画内纵深（roadDirection=depth）与横向动线（screenPath=left-to-right）矛盾——成片会呈现「横穿马路」违和。二选一：动线改 toward-camera/away-from-camera（沿路走），或 roadDirection 改 lateral（道路横铺、侧拍构图）。
  - when: [scene.geometry.roadDirection==depth, scene.traffic.screenPath==right-to-left]
    message: 空间几何冲突：道路画内纵深（roadDirection=depth）与横向动线（screenPath=right-to-left）矛盾——成片会呈现「横穿马路」违和。二选一：动线改 toward-camera/away-from-camera（沿路走），或 roadDirection 改 lateral（道路横铺、侧拍构图）。
  - when: [scene.geometry.roadDirection==lateral, scene.traffic.screenPath==toward-camera]
    message: 空间几何冲突：道路画内横向铺开（roadDirection=lateral）与纵深动线（screenPath=toward-camera）矛盾——「沿路走」与画内道路走向不符。二选一：动线改 left-to-right/right-to-left，或 roadDirection 改 depth。
  - when: [scene.geometry.roadDirection==lateral, scene.traffic.screenPath==away-from-camera]
    message: 空间几何冲突：道路画内横向铺开（roadDirection=lateral）与纵深动线（screenPath=away-from-camera）矛盾——「沿路走」与画内道路走向不符。二选一：动线改 left-to-right/right-to-left，或 roadDirection 改 depth。
reservedWho: [环境, 镜头]
zh:
  scene.geometry.roadDirection:
    depth: 道路画内纵深
    lateral: 道路画内横向铺开
    none: 无明确道路走向
  scene.traffic.screenPath:
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
  scene:
    location: 校园梧桐林荫道
    period: 放学傍晚
    lightState: 夕阳暖光、斑驳树影
    anchors:
      ground: 柏油人行道
      lightSource: 夕阳自左侧逆光
      scaleRef: 成排梧桐、等距灯柱
    geometry:
      roadDirection: depth
    camera:
      side: 道路右侧、镜头朝道路深处
      axis: 角色A恒画左、角色B恒画右
    traffic:
      screenPath: away-from-camera
      note: 两人沿路向画面深处走远
  characters:
    - id: A
      ref: 回眸少女
      proportions: 少女比同学高约半头
      position: { screen: left, depth: mid }
      facing: 向画面深处
      motion: 推车缓行
      props: [银灰色旧单车（全程推行：行驶/停靠/续行均不离手）]
  interaction:
    groundContact: 双脚踩实柏油路面、阴影随人贴地
    occlusion: 人物在梧桐行道间行走、前景偶有虚化梧桐叶
    scaleRatio: 身高约灯柱一半、车把到腰
    propStates: A全程随身：银灰色旧单车
  timeline:
    events:
      - seq: 1
        who: [A]
        action: 推着银灰色旧单车沿路行进
        durationSecs: 4
      - seq: 2
        who: [A]
        action: 停下回眸微笑，银灰色旧单车仍扶在手中
        durationSecs: 1
---

# 基础面卡（foundation）

任何镜头都先回答「拍什么」再谈「怎么拍」，且**声明有主序：先立景，再入人，再定交互，最后可选加动线**。11 域轴（景别/机位/…）是拍法翻译层，本卡是它们的地基——没有本卡的几何与三锚，方向词（「沿林荫道走」「画面左侧」）、身高数字、道具归属就都是没有世界语义的空转。（升级自旧「四要素基础卡」：时间/空间/人物/事件 → 景/人/交互/动线，S006 及之前镜头为旧协议历史产物。）

## 各块要点

- **scene（景块，必填·先立）**：场景地点 + 光照时辰（`period`） + **三锚**（`anchors.ground` 地面锚 / `anchors.lightSource` 光源锚 / `anchors.scaleRef` 尺度参照锚）+ 道路走向（`geometry.roadDirection`，**纵深 depth / 横铺 lateral / none**）+ 相机世界方位与 180° 轴线（`camera`）+ 动线（`traffic.screenPath`）。三锚是「规律长在景上」的事实源：地面钉接触、光源钉光影一致、尺度参照钉比例参照系——人物的比例与阴影描述都相对三锚表达。
- **characters（人块，必填）**：编号（id）→ 角色（ref，引用 `material/` 实体名或 wiki 规范名）→ **骨架比例**（proportions：相对身高/头身比/与道具比例——相对参照系描述，数字身高是弱锚）→ **画面位**（position.screen=画左/画右/画中/整体 + position.depth=前景/中景/背景，多人戏必须每人写死画面位）→ 朝向（facing）→ 动作（motion）→ 持有物（props，可选）。
- **interaction（交互块，必填）**：接触落地（groundContact）、遮挡前后（occlusion）、人-景尺度比（scaleRatio）、道具恒存态（propStates：随身/在场/离手）。景律与人律在这里对齐——横穿马路式的违和就是交互律断裂；车留原地式的违和就是恒存态没钉住。
- **timeline（动线块，可选）**：事件编号序列（`events[].seq`）+ 事件主体（who 引用角色 id 或「环境/镜头」）+ 动作（action）。静态镜头、画面内无状态变化的镜头整块缺省。

## 持有物（characters[].props）

- 人物随身携带的道具在 `props` 声明为「名（状态）」数组：`["银灰色旧单车（全程推行：行驶/停靠/续行均不离手）"]`。
- **该角色出场的每个事件动作都必须重述道具名**（机器硬拦）：尾段动作写「并肩走远（A 推着银灰色旧单车）」，不写「并肩走远」——历史事故：S006 尾段丢车，人走了车留在原地。
- 不携带道具缺省该字段；道具的外观锚与跨镜一致性走 material 道具档案（共识门控），不在 foundation 复制一份。
- `interaction.propStates` 是道具归属的总声明（随身/在场/离手），与 `props` 一一对应。

## 方向词纪律（先世界后屏幕）

- 屏幕方向（画面左/右、走近/走远）只是 **世界方向的投影**：先定世界（路往哪走、人往哪去、相机在哪、轴怎么定），再写屏幕词。
- 「沿路走」必须依赖 roadDirection 先成立：`depth` → 动线只能 toward-camera / away-from-camera；`lateral` → 动线只能 left-to-right / right-to-left。冲突组合会被 generate_shot **硬拦**（历史事故：S005「道路纵深 + 横穿动线」，见故事 corrections）。
- 180° 轴线写进 `scene.camera.axis`（如「角色A恒画左、角色B恒画右」），双人戏开工前过检。

## 反例（为什么必须有这张卡）

> 事故①：S005 一镜到底成片「路是垂直的，人物却水平横穿马路」——提示词写了「沿林荫道」+「向画面右侧」，两个空间指令互相矛盾，模型任选其一交差。
> 事故②：S002–S004 三镜连戏「衔接人物位置和上一镜相反」——三镜只有一镜写了画面位，位置定义从未入列。
> 事故③：S006「人走后自行车留在原地」——事件序列的道具线断裂，尾段动作没有重述持有状态。
> 事故④：S006「腿部比例和身体比例差太多」——景块缺尺度参照锚（比例参照系悬空）、人块缺骨架比例声明、拍摄决策放大器（FS 全身小像×12s 连续行走）三重在场。

四起事故的机器解都在本卡：冲突表拦 ①；characters[].position 必填拦 ②；持有物重述规则拦 ③；三锚 + proportions 必填把 ④ 的比例参照系钉进输入。
# 受击透明与雪橇贴图修复

## 受击透明

有效伤害结算完成后，`damageZombie` 在实体状态中记录 `hitFlashUntil`。持续时间固定为 0.12 秒（12cs，即 3 个 4cs 逻辑帧），绘制时只把僵尸主体透明度乘以 0.5；血条、防具文字、元素状态和标签不受影响。计时完全复用 `state.time`，不创建独立定时器。

## 雪橇资源

`bobsled_walk.webp`、`bobsled_attack.webp`、`bobsled_death.webp` 来自时空版 `images/Zombies/AddedAnimations/oBobsledZombie/`。图集帧尺寸为 477×386，分别包含 15、16、24 帧。`bobsled_sled.webp` 仍为独立雪橇载具资源；小丑仍只绑定 `zombie.b05a.jack.*`。

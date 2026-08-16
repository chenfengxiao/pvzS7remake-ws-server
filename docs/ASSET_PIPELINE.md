# 资源管线

## 1. 来源

开发版从最终单文件中恢复了 339 个唯一资源。来源单文件 SHA-256 位于：

```text
sources/SOURCE_SHA256.txt
```

资源清单位于：

```text
config/asset-manifest.json
```

## 2. 目录约定

- `assets/plants_*`：植物 atlas、视频提取片段。
- `assets/zombies_*`：普通、装备、JSPVZ 和补充僵尸动画。
- `assets/final_runtime`：最终特殊僵尸、植物头僵尸运行资源。
- `assets/projectiles_b06`：统一弹体。
- `assets/effects_bili`：B站素材包复核后的喷射/粒子效果。
- `assets/user_grid_plants`：用户提供的 4×2 整株精灵图。
- `assets/ui`：背景、阶数牌等 UI 资源。
- `assets/sfx`：音效。

## 3. 修改资源后的处理

当前 asset manifest 保存的是拆包时哈希。若有意替换资源，应执行：

```bash
python3 tools/update_asset_manifest.py
python3 tools/verify_project.py
```

不要手工编辑 Base64。单文件由构建工具自动生成。

## 4. 单文件构建

```bash
python3 tools/build_singlefile.py
```

输出：

```text
dist/S7_REBUILT_SINGLEFILE.html
```

构建器会：

1. 内联 CSS；
2. 按 `index.html` 顺序内联 JS；
3. 将 `assets/` 重新编码成内嵌资源节点；
4. 注入单文件资源解析器；
5. 删除开发版外部路径解析器。

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a WeChat Mini Program (微信小程序) called "图像工具箱" (Image Toolbox) that provides image processing tools including compression, cropping, watermarking, ID photos, batch processing, rotation, and color adjustment.

## Development

### Build/Run
- Open the project in WeChat DevTools (微信开发者工具)
- Use the `project.config.json` configuration (appid: `wx553322563a77d63d`)
- No build step required - WeChat Mini Programs are interpreted directly

### Code Style
- Tab size: 2 spaces (configured in `project.config.json`)
- ES6 syntax enabled
- Uses CommonJS module format (`require`/`module.exports`)

## Architecture

### Page Structure
- **Main tabs**: `pages/index/`, `pages/history/`, `pages/settings/`
- **Tool pages**: `pages/tools/{compress,edit,watermark,idphoto,batch,crop,rotate,adjust}/`
- Each page consists of `.js`, `.wxml`, `.wxss`, `.json` files

### Core Modules (`utils/`)

**`imagePipeline.js`** - Central image processing engine:
- `runTask(task)` - Executes a single image task by type
- `runBatch(tasks, onProgress)` - Batch processing with progress callback
- `TASK_HANDLERS` - Maps task types to processing functions
- Uses Canvas 2D API for image manipulation
- Task types: `compress`, `watermark`, `edit`, `beauty`, `idphoto`, `crop`, `rotate`, `adjust`

**`storage.js`** - Data persistence:
- `getSettings()`/`setSettings()` - User preferences
- `getHistory()`/`pushHistory()`/`clearHistory()` - Processing history (max 100 items)
- Keys: `img_toolbox_history_v1`, `img_toolbox_settings_v1`

**`export.js`** - Output utilities:
- `saveToAlbum(filePath)` - Save to photo album with permission handling
- `showShareHint()` - Trigger share menu

### Canvas Pattern
Tool pages use off-screen canvas for image processing:
```html
<canvas type="2d" class="hiddenCanvas" id="canvas"></canvas>
```
Canvas is retrieved via `wx.createCanvasContext()` or selector query, then passed to `imagePipeline` functions.

### Styling Conventions
Global styles in `app.wxss` define reusable classes:
- `.page` - Base page container with gradient background
- `.card` - White rounded card with shadow
- `.seg`/`.segItem` - Segmented control
- `.primaryBtn`/`.ghostBtn`/`.pillBtn` - Button variants
- `.previewGrid`/`.previewItem` - Before/after image comparison layout
- `.dragNumWrap` - Draggable number input styling

### Adding New Tools
1. Create page directory under `pages/tools/{toolname}/`
2. Register page in `app.json` pages array
3. Add navigation mapping in `pages/index/index.js` `toolMap`
4. Implement task handler in `imagePipeline.js` `TASK_HANDLERS`
5. Use `runTask()` to execute and `pushHistory()` will be called automatically
# Agent Implementation Log

## Overview

This document tracks all architectural and feature changes made to the Tint_Hint project with the assistance of Zed AI agents.

---

## Session 1: Image Adjustment Feature

**Date**: June 8, 2026

**Summary**: Added real-time brightness, contrast, and saturation adjustments in the LAB color space, applied before quantization. This enables users to fine-tune image tone and color intensity before palette reduction.

### Changes Made

#### 1. New Shader: `src/shaders/colours/adjust.wgsl`

A WebGPU compute shader that performs three perceptually-correct adjustments in the LAB color space:

- **Brightness**: Additive offset to the L\* (lightness) channel
- **Contrast**: Multiplicative scaling of L\* around the perceptual midpoint (50)
- **Saturation**: Radial scaling of the a\* and b\* (chroma) axes

**Key properties**:
- Operates on LAB textures (rgba16float format)
- 8×8 workgroup size (consistent with other color shaders)
- Parameters passed via a uniform buffer (4 × f32)
- No clamping on a\*/b\* — the quantizer gracefully handles out-of-gamut values

#### 2. New Service: `src/services/Adjust.service.ts`

Implements the adjustment pipeline following the existing pattern from `ColourService`:

- **Method**: `async adjust(inputKey, outputKey, params)`
- **Input**: LAB texture identified by `inputKey`
- **Output**: Adjusted LAB texture stored with `outputKey`
- **Params**: `AdjustmentParams` object (brightness, contrast, saturation)

**Implementation notes**:
- Initializes shader pipeline and 16-byte uniform buffer in `initialize()`
- Uploads params to GPU on every call via `queue.writeBuffer()`
- Creates output texture on-demand (no pooling)
- Integrates with existing `TextureManagerService` for texture lifecycle

#### 3. Type Definition: `src/types/types.ts`

Added `AdjustmentParams` interface:

```typescript
export interface AdjustmentParams {
    brightness: number; // L* additive offset: -50 to +50, default 0
    contrast: number;   // L* scale around midpoint: 0.1 to 3.0, default 1.0
    saturation: number; // a*/b* scale factor: 0.0 to 3.0, default 1.0
}
```

#### 4. Editor Service Integration: `src/services/Editor.service.ts`

**Initialization**:
- Instantiate `AdjustService` in constructor
- Call `await adjustService.initialize()` in `initialize()` method

**Image Loading Pipeline** (`loadImage()`):
- Original: `RGB → LAB → Quantize → RGB → Render`
- New: `RGB → LAB → **Adjust** → Quantize → RGB → Render`

**State Management**:
- Added `adjustmentParams` property with default values
- All three controls start at neutral (brightness: 0, contrast: 1.0, saturation: 1.0)

**New Public Method** (`updateAdjustments()`):
- Called when user moves an adjustment slider
- Reuses stable `"lab"` texture (decoded on image load) as the base
- Re-runs only the three downstream GPU passes: adjust → quantize → convert to RGB → render
- Far more efficient than re-loading the image

**Data Flow**:
```
loadImage:
  original (RGB) 
    → rgb_to_lab (lab texture — stored, never changes)
    → adjust (adjusted_lab)
    → quantize (quantized)
    → lab_to_rgb (final_rgb_output)
    → render

updateAdjustments (user moves slider):
  lab (reused base)
    → adjust (adjusted_lab — recalculated)
    → quantize (quantized — recalculated)
    → lab_to_rgb (final_rgb_output)
    → render
```

#### 5. Vue Component UI: `src/components/ImageEditor.vue`

**Reactive State**:
```typescript
const adjustmentParams = ref<AdjustmentParams>({
    brightness: 0,
    contrast: 1.0,
    saturation: 1.0,
});

const adjustmentRanges: Record<keyof AdjustmentParams, { min; max; step }> = {
    brightness: { min: -50,  max: 50,  step: 0.5  },
    contrast:   { min: 0.1,  max: 3.0, step: 0.05 },
    saturation: { min: 0.0,  max: 3.0, step: 0.05 },
};
```

**UI Section** (rendered above Kuwahara controls):
- Displays three range sliders for brightness, contrast, saturation
- Labels show current value in real-time
- Slider IDs prefixed with `"adj-"` to avoid collision with Kuwahara controls

**Reactivity**:
- Deep watcher on `adjustmentParams` ref
- On any change, calls `imageEditor.updateAdjustments(...)`
- Only active after image is loaded (`v-if="imageLoaded"`)

### Design Decisions

1. **LAB Color Space**: Chosen because:
   - Already performing quantization in LAB (perceptually uniform)
   - Brightness, contrast, and saturation are semantically correct in LAB
   - No hue shift from adjustments (unlike RGB-based approaches)

2. **Placement Before Quantization**:
   - User adjusts the image tone/saturation
   - Quantizer then selects palette colors from this adjusted appearance
   - Produces more natural results than adjusting after quantization

3. **Stable Base Texture**:
   - `"lab"` texture created once on image load
   - `updateAdjustments()` reuses it, avoiding expensive RGB→LAB conversion on every slider change
   - Only re-runs three fast GPU passes downstream

4. **Parameter Ranges**:
   - **Brightness**: ±50 allows for significant darkening/lightening without leaving LAB bounds
   - **Contrast**: 0.1–3.0 provides subtle to dramatic tonal adjustments
   - **Saturation**: 0.0–3.0 allows desaturation to grayscale and vibrant color boost

### Testing

- **Build**: `npm run build` produces clean Vite output (114.70 kB gzipped)
- **Type Safety**: No new TypeScript errors introduced
- **GPU Pipeline**: Follows established patterns from `ColourService` and `KuwaharaService`

### Future Enhancements

- Hue rotation in LAB (rotate angle in a\*/b\* plane)
- Vibrance adjustment (saturation that preserves near-neutral tones)
- Curves adjustment (non-linear L\* mapping)
- History/undo for adjustment parameter changes

---

## Architecture Overview

### Service Layer Structure

```
┌─────────────────────────────────────────┐
│      ImageEditorService (main)          │
│  Orchestrates pipeline and UI callbacks │
└─────────────────────────────────────────┘
          ↓
┌────────────────────────────────────────────────────────────┐
│  Specialized Services (GPU pipelines)                       │
├────────────────────────────────────────────────────────────┤
│ • WebGPUCore       (singleton, device/context)             │
│ • RenderService    (canvas rendering)                      │
│ • TextureManager   (texture lifecycle, keyed storage)      │
│ • ColourService    (RGB↔LAB conversion)                    │
│ • AdjustService    (LAB adjustments) ← NEW                 │
│ • QuantizeService  (color reduction)                       │
│ • KuwaharaService  (artistic edge-aware filtering)         │
│ • PaletteService   (Copic color management)                │
└────────────────────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────┐
│    WebGPU GPU Pipelines (shaders)       │
├─────────────────────────────────────────┤
│ • rgb_to_lab.wgsl                       │
│ • adjust.wgsl ← NEW                     │
│ • quantize.wgsl                         │
│ • lab_to_rgb.wgsl                       │
│ • kuwahara/* (4 sub-passes)             │
│ • fragment/vertex (canvas output)       │
└─────────────────────────────────────────┘
```

### File Inventory

#### Services
- `src/services/WebGPU.service.ts` — WebGPU device & context management
- `src/services/Textures.service.ts` — GPU texture lifecycle (keyed storage)
- `src/services/Colours.service.ts` — LAB conversions (RGB↔LAB)
- `src/services/Adjust.service.ts` — **NEW** LAB adjustments
- `src/services/Quantize.service.ts` — Color quantization to palette
- `src/services/Kuwahara.service.ts` — Edge-aware artistic filtering
- `src/services/Palettes.service.ts` — Copic palette selection/management
- `src/services/Render.service.ts` — Canvas rendering
- `src/services/Editor.service.ts` — Main orchestration

#### Shaders
- `src/shaders/colours/rgb_to_lab.wgsl` — sRGB → LAB conversion
- `src/shaders/colours/adjust.wgsl` — **NEW** brightness/contrast/saturation
- `src/shaders/colours/quantize.wgsl` — Nearest-neighbor quantization
- `src/shaders/colours/lab_to_rgb.wgsl` — LAB → sRGB conversion
- `src/shaders/kuwahara/*.wgsl` — Edge detection & filtering (4 passes)
- `src/shaders/vertex.wgsl` — Screen quad vertex shader
- `src/shaders/fragment.wgsl` — Canvas rendering fragment shader

#### Types
- `src/types/types.ts` — TypeScript interfaces
  - `ManagedTexture`
  - `KuwaharaParams`
  - `AdjustmentParams` — **NEW**
  - `CopicColour`
  - `CopicJsonColor`, `CopicJsonData`

#### Components
- `src/components/ImageEditor.vue` — Main UI (Vue 3 SFC with Composition API)

### Dependency Graph

```
ImageEditor.vue
    ↓
ImageEditorService
    ├── WebGPUCore (singleton)
    ├── RenderService
    ├── TextureManagerService
    ├── ColourService (singleton)
    ├── AdjustService ← NEW
    ├── QuantizeService
    ├── KuwaharaService
    ├── PaletteService
    └── (all depend on TextureManagerService for storage)
```

---

## Known Issues (Pre-existing)

1. **Unused texture fields** in `Kuwahara.service.ts`:
   - `blurHorizontalTexture`, `blurVerticalTexture`, `eigenvectorTexture` declared but not read
   - Can be removed or utilized in future visualization features

2. **NewType undefined** in `types.ts` line 5:
   - `format: NewType` in `ManagedTexture` — should be a GPUTextureFormat union
   - Does not affect runtime (web browser only accepts valid formats)

3. **Potential undefined index** in `Quantize.service.ts`:
   - `activePalette[paletteIndex]` — paletteIndex could theoretically be out of bounds
   - Guarded by `?? null` fallback

These are lint warnings and do not prevent the project from building or running.

---

## Build & Run

```bash
# Install dependencies
npm install

# Development server with hot reload
npm run dev

# Type-check (TypeScript)
npm run type-check

# Build for production
npm run build

# Preview production build locally
npm run preview
```

The project uses:
- **Vue 3** (Composition API with `<script setup>`)
- **TypeScript** for type safety
- **Vite** as build tool and dev server
- **WebGPU** for GPU compute and rendering

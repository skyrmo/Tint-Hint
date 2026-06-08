export interface ManagedTexture {
    texture: GPUTexture;
    width: number;
    height: number;
    format: NewType;
}

export interface KuwaharaParams {
    kernelSize: number;
    sharpness: number;
    hardness: number;
    alpha: number;
    zeroCrossing: number;
    zeta: number;
    sigma: number;
}

export interface AdjustmentParams {
    brightness: number; // L* additive offset: -50 to +50, default 0
    contrast: number; // L* scale around midpoint: 0.1 to 3.0, default 1.0
    saturation: number; // a*/b* scale factor: 0.0 to 3.0, default 1.0
}

export interface CopicColour {
    code: string;
    name: string;
    hex: string;
    rgb: [number, number, number];
    lab: [number, number, number];
}

interface CopicJsonColor {
    code: string;
    name: string;
    hex: string;
    rgb: [number, number, number];
    hsl: [number, number, number];
}

export interface CopicJsonData {
    metadata: any;
    colors: CopicJsonColor[];
}

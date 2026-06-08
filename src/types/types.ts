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

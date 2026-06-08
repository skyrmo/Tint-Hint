import type { ManagedTexture } from "../types/types";
import type { TextureManagerService } from "./Textures.service";
import { WebGPUCore } from "./WebGPU.service";
import rgbToLabShaderCode from "../shaders/colours/rgb_to_lab.wgsl?raw";
import labToRgbShaderCode from "../shaders/colours/lab_to_rgb.wgsl?raw";

export class ColourService {
    private static instance: ColourService | null = null;
    private core: WebGPUCore;
    private textureManager: TextureManagerService;

    // GPU Resources
    private rgbToLabPipeline: GPUComputePipeline | null = null;
    private labToRgbPipeline: GPUComputePipeline | null = null;

    private constructor(textureManager: TextureManagerService) {
        this.core = WebGPUCore.getInstance();
        this.textureManager = textureManager;
    }

    static getInstance(textureManager: TextureManagerService): ColourService {
        if (!ColourService.instance) {
            ColourService.instance = new ColourService(textureManager);
        }
        return ColourService.instance;
    }

    async initialize(): Promise<void> {
        const device = this.core.getDevice();

        // Create shader module
        const rgbToLabshaderModule = device.createShaderModule({
            label: "RGB to Lab Shader",
            code: rgbToLabShaderCode,
        });

        // Create compute pipeline for image conversion
        this.rgbToLabPipeline = device.createComputePipeline({
            label: "RGB to Lab Pipeline",
            layout: "auto",
            compute: {
                module: rgbToLabshaderModule,
                entryPoint: "computeMain",
            },
        });

        // init lab to rgb pipeline
        const labToRgbShaderModule = device.createShaderModule({
            label: "Lab to RGB Shader",
            code: labToRgbShaderCode,
        });

        this.labToRgbPipeline = device.createComputePipeline({
            label: "Lab to RGB Pipeline",
            layout: "auto",
            compute: {
                module: labToRgbShaderModule,
                entryPoint: "computeMain",
            },
        });
    }

    async convertTextureRgbToLab(
        inputTextureKey: string,
        outputTextureKey: string,
    ): Promise<ManagedTexture | null> {
        const device = this.core.getDevice();

        // Get input texture
        const inputTexture = this.textureManager.getTexture(inputTextureKey);
        if (!inputTexture) {
            console.error(`Input texture "${inputTextureKey}" not found`);
            return null;
        }

        // Create output texture for Lab values
        const outputTexture = device.createTexture({
            label: `lab`,
            size: [inputTexture.width, inputTexture.height, 1],
            // format: "rgba32float", // Use float format for Lab precision
            format: "rgba16float", // Use float format for Lab precision
            usage:
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC,
        });

        // Create bind group
        const bindGroup = device.createBindGroup({
            label: "RGB to Lab Bind Group",
            layout: this.rgbToLabPipeline!.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: inputTexture.texture.createView(),
                },
                {
                    binding: 1,
                    resource: outputTexture.createView(),
                },
            ],
        });

        // Create command encoder
        const commandEncoder = device.createCommandEncoder({
            label: "RGB to Lab Conversion",
        });

        // Dispatch compute pass
        const computePass = commandEncoder.beginComputePass({
            label: "RGB to Lab Compute Pass",
        });

        computePass.setPipeline(this.rgbToLabPipeline!);
        computePass.setBindGroup(0, bindGroup);

        // Calculate dispatch size (8x8 workgroups)
        const dispatchX = Math.ceil(inputTexture.width / 8);
        const dispatchY = Math.ceil(inputTexture.height / 8);

        computePass.dispatchWorkgroups(dispatchX, dispatchY, 1);
        computePass.end();

        // Submit commands
        device.queue.submit([commandEncoder.finish()]);

        // Store output texture
        const managedTexture: ManagedTexture = {
            texture: outputTexture,
            width: inputTexture.width,
            height: inputTexture.height,
            format: "rgba16float",
        };

        this.textureManager.setTexture(outputTextureKey, managedTexture);

        return managedTexture;
    }

    async convertTextureLabToRgb(
        inputTextureKey: string,
        outputTextureKey: string,
    ): Promise<ManagedTexture | null> {
        const device = this.core.getDevice();

        // Get input texture
        const inputTexture = this.textureManager.getTexture(inputTextureKey);
        if (!inputTexture) {
            console.error(`Input texture "${inputTextureKey}" not found`);
            return null;
        }

        // Create output texture for RGB values
        const outputTexture = device.createTexture({
            label: `rgb`,
            size: [inputTexture.width, inputTexture.height, 1],
            format: "rgba8unorm",
            usage:
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC |
                GPUTextureUsage.COPY_DST,
        });

        // Create bind group
        const bindGroup = device.createBindGroup({
            label: "Lab to RGB Bind Group",
            layout: this.labToRgbPipeline!.getBindGroupLayout(0),
            entries: [
                {
                    binding: 0,
                    resource: inputTexture.texture.createView(),
                },
                {
                    binding: 1,
                    resource: outputTexture.createView(),
                },
            ],
        });

        // Create command encoder
        const commandEncoder = device.createCommandEncoder({
            label: "Lab to RGB Conversion",
        });

        // Dispatch compute pass
        const computePass = commandEncoder.beginComputePass({
            label: "Lab to RGB Compute Pass",
        });

        computePass.setPipeline(this.labToRgbPipeline!);
        computePass.setBindGroup(0, bindGroup);

        // Calculate dispatch size (8x8 workgroups)
        const dispatchX = Math.ceil(inputTexture.width / 8);
        const dispatchY = Math.ceil(inputTexture.height / 8);

        computePass.dispatchWorkgroups(dispatchX, dispatchY, 1);
        computePass.end();

        // Submit commands
        device.queue.submit([commandEncoder.finish()]);

        // Store output texture
        const managedTexture: ManagedTexture = {
            texture: outputTexture,
            width: inputTexture.width,
            height: inputTexture.height,
            format: "rgba8unorm",
        };

        this.textureManager.setTexture(outputTextureKey, managedTexture);

        return managedTexture;
    }

    rgbToLabCPU(rgb: [number, number, number]): [number, number, number] {
        // Normalize to 0-1 range if input is 0-255
        const r = rgb[0] / 255;
        const g = rgb[1] / 255;
        const b = rgb[2] / 255;

        // D65 standard illuminant
        const D65_X = 95.047;
        const D65_Y = 100.0;
        const D65_Z = 108.883;

        // Step 1: sRGB to linear RGB
        const srgbToLinear = (c: number): number => {
            if (c <= 0.04045) {
                return c / 12.92;
            } else {
                return Math.pow((c + 0.055) / 1.055, 2.4);
            }
        };

        const linearR = srgbToLinear(r);
        const linearG = srgbToLinear(g);
        const linearB = srgbToLinear(b);

        // Step 2: Linear RGB to XYZ (sRGB primaries, D65 illuminant)
        const X = (0.4124564 * linearR + 0.3575761 * linearG + 0.1804375 * linearB) * 100.0;
        const Y = (0.2126729 * linearR + 0.7151522 * linearG + 0.072175 * linearB) * 100.0;
        const Z = (0.0193339 * linearR + 0.119192 * linearG + 0.9503041 * linearB) * 100.0;

        // Step 3: XYZ to Lab conversion helper
        const xyzToLabComponent = (t: number): number => {
            const delta = 6.0 / 29.0;
            const deltaSq = delta * delta;
            const deltaCb = deltaSq * delta;

            if (t > deltaCb) {
                return Math.pow(t, 1.0 / 3.0);
            } else {
                return t / (3.0 * deltaSq) + 4.0 / 29.0;
            }
        };

        const xn = X / D65_X;
        const yn = Y / D65_Y;
        const zn = Z / D65_Z;

        const fx = xyzToLabComponent(xn);
        const fy = xyzToLabComponent(yn);
        const fz = xyzToLabComponent(zn);

        const l = 116.0 * fy - 16.0;
        const a = 500.0 * (fx - fy);
        const b_value = 200.0 * (fy - fz);

        return [l, a, b_value];
    }
}

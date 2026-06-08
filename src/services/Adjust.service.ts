import { WebGPUCore } from "./WebGPU.service";
import { TextureManagerService } from "./Textures.service";
import adjustShaderCode from "../shaders/colours/adjust.wgsl?raw";
import type { AdjustmentParams } from "../types/types";

export class AdjustService {
    private core: WebGPUCore;
    private textureManager: TextureManagerService;

    private pipeline: GPUComputePipeline | null = null;
    private paramsBuffer: GPUBuffer | null = null;

    constructor(textureManager: TextureManagerService) {
        this.core = WebGPUCore.getInstance();
        this.textureManager = textureManager;
    }

    async initialize(): Promise<void> {
        const device = this.core.getDevice();

        const shaderModule = device.createShaderModule({
            label: "Lab Adjustment Shader",
            code: adjustShaderCode,
        });

        this.pipeline = device.createComputePipeline({
            label: "Lab Adjustment Pipeline",
            layout: "auto",
            compute: {
                module: shaderModule,
                entryPoint: "computeMain",
            },
        });

        // 4 x f32: brightness, contrast, saturation, padding
        this.paramsBuffer = device.createBuffer({
            label: "Adjustment Params Buffer",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
    }

    async adjust(
        inputKey: string,
        outputKey: string,
        params: AdjustmentParams,
    ): Promise<void> {
        if (!this.pipeline || !this.paramsBuffer) {
            throw new Error("AdjustService not initialized. Call initialize() first.");
        }

        const device = this.core.getDevice();
        const inputTexture = this.textureManager.getTexture(inputKey);

        if (!inputTexture) {
            throw new Error(`AdjustService: input texture "${inputKey}" not found`);
        }

        // Upload params to GPU
        device.queue.writeBuffer(
            this.paramsBuffer,
            0,
            new Float32Array([params.brightness, params.contrast, params.saturation, 0.0]),
        );

        const outputTexture = device.createTexture({
            label: outputKey,
            size: [inputTexture.width, inputTexture.height, 1],
            format: "rgba16float",
            usage:
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC,
        });

        const bindGroup = device.createBindGroup({
            label: "Lab Adjustment Bind Group",
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: inputTexture.texture.createView() },
                { binding: 1, resource: outputTexture.createView() },
                { binding: 2, resource: { buffer: this.paramsBuffer } },
            ],
        });

        const encoder = device.createCommandEncoder({ label: "Lab Adjustment" });
        const pass = encoder.beginComputePass({ label: "Lab Adjustment Pass" });

        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(
            Math.ceil(inputTexture.width / 8),
            Math.ceil(inputTexture.height / 8),
        );
        pass.end();

        device.queue.submit([encoder.finish()]);

        this.textureManager.setTexture(outputKey, {
            texture: outputTexture,
            width: inputTexture.width,
            height: inputTexture.height,
            format: "rgba16float",
        });
    }
}

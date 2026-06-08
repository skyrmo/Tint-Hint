import { WebGPUCore } from "./WebGPU.service";
import quantizeShaderCode from "../shaders/colours/quantize.wgsl?raw";
import { TextureManagerService } from "./Textures.service";
import type { CopicColour, ManagedTexture } from "../types/types";

export class QuantizeService {
    private core: WebGPUCore;
    private textureManager: TextureManagerService;

    // Pipeline
    private quantizePipeline: GPUComputePipeline | null = null;

    // Quantize resources
    private outputTexture: GPUTexture | null = null;
    private indexTexture: GPUTexture | null = null;
    private centroidsBuffer: GPUBuffer | null = null; // centroids are the colours to quantize to
    private numCentroidsBuffer: GPUBuffer | null = null;

    private paletteIndexData: Uint32Array | null = null;
    private paletteIndexWidth = 0;
    private paletteIndexHeight = 0;
    private activePalette: CopicColour[] = [];

    private MAX_CENTROIDS = 400;

    constructor(textureManager: TextureManagerService) {
        this.core = WebGPUCore.getInstance();
        this.textureManager = textureManager;
    }

    async initialize() {
        const device = this.core.getDevice();

        // Assignment pipeline
        const quantizeShaderModule = device.createShaderModule({
            code: quantizeShaderCode,
        });

        this.quantizePipeline = device.createComputePipeline({
            layout: "auto",
            compute: {
                module: quantizeShaderModule,
                entryPoint: "computeMain",
            },
        });
    }

    private async initializeQuantizeResources(originalTexture: ManagedTexture) {
        const device = this.core.getDevice();
        const { width, height } = originalTexture;

        // Centroids buffer
        this.centroidsBuffer = device.createBuffer({
            label: "centroids buffer",
            size: this.MAX_CENTROIDS * 4 * 4, // vec4f per centroid
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        // Number of centroids uniform
        this.numCentroidsBuffer = device.createBuffer({
            label: "num centroids buffer",
            size: 16, // vec4<u32> but only x component is used
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Output texture
        this.outputTexture = device.createTexture({
            label: "output texture",
            size: [width, height, 1],
            format: "rgba16float",
            usage:
                GPUTextureUsage.STORAGE_BINDING |
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_SRC,
        });

        this.indexTexture = device.createTexture({
            label: "quantized palette index texture",
            size: [width, height, 1],
            format: "r32uint",
            usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.COPY_SRC,
        });
    }

    async quantize(selectedPaletteColours: CopicColour[], inputImageKey = "original") {
        const originalTexture = this.textureManager.getTexture(inputImageKey);
        if (!originalTexture) {
            throw new Error("No image loaded");
        }

        if (selectedPaletteColours.length === 0) {
            throw new Error("No Copic colours selected for quantization");
        }

        if (selectedPaletteColours.length > this.MAX_CENTROIDS) {
            throw new Error(
                `Selected palette has ${selectedPaletteColours.length} colours, but quantization supports at most ${this.MAX_CENTROIDS}`,
            );
        }

        this.activePalette = [...selectedPaletteColours];
        this.paletteIndexData = null;
        this.paletteIndexWidth = 0;
        this.paletteIndexHeight = 0;

        // Initialize buffers and textures
        await this.initializeQuantizeResources(originalTexture);

        // Create centroids from selected palette colors (RGB values)
        const centroids = new Float32Array(selectedPaletteColours.length * 4);

        // populate the centroids with the selected colours.
        selectedPaletteColours.forEach((colour, i) => {
            centroids[i * 4] = colour.lab[0];
            centroids[i * 4 + 1] = colour.lab[1];
            centroids[i * 4 + 2] = colour.lab[2];
            centroids[i * 4 + 3] = 1.0; // Unused
        });

        const device = this.core.getDevice();
        device.queue.writeBuffer(this.centroidsBuffer!, 0, centroids);

        // Write the number of centroids (with padding)
        const numCentroidsData = new Uint32Array([selectedPaletteColours.length, 0, 0, 0]);
        device.queue.writeBuffer(this.numCentroidsBuffer!, 0, numCentroidsData);

        // Run assignment step
        await this.runAssignmentShader(originalTexture);

        this.paletteIndexData = await this.readPaletteIndexTexture(
            originalTexture.width,
            originalTexture.height,
        );
        this.paletteIndexWidth = originalTexture.width;
        this.paletteIndexHeight = originalTexture.height;
    }

    private async runAssignmentShader(originalTexture: ManagedTexture) {
        if (
            !this.quantizePipeline ||
            !this.centroidsBuffer ||
            !this.numCentroidsBuffer ||
            !this.outputTexture ||
            !this.indexTexture
        ) {
            throw new Error("Quantize resources not initialized");
        }

        const device = this.core.getDevice();
        const bindGroup = device.createBindGroup({
            layout: this.quantizePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: originalTexture.texture.createView() },
                { binding: 1, resource: { buffer: this.centroidsBuffer } },
                { binding: 2, resource: this.outputTexture.createView() },
                { binding: 3, resource: { buffer: this.numCentroidsBuffer } },
                { binding: 4, resource: this.indexTexture.createView() },
            ],
        });

        const commandEncoder = device.createCommandEncoder();
        const passEncoder = commandEncoder.beginComputePass();

        passEncoder.setPipeline(this.quantizePipeline);
        passEncoder.setBindGroup(0, bindGroup);

        // Dispatch workgroups
        const workgroupsX = Math.ceil(originalTexture.width / 8);
        const workgroupsY = Math.ceil(originalTexture.height / 8);
        passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY);

        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);

        await device.queue.onSubmittedWorkDone();

        // Store the quantized result
        this.textureManager.setTexture("quantized", {
            texture: this.outputTexture,
            width: originalTexture.width,
            height: originalTexture.height,
            format: "rgba16float",
        });
    }

    private async readPaletteIndexTexture(width: number, height: number): Promise<Uint32Array> {
        if (!this.indexTexture) {
            throw new Error("Palette index texture not initialized");
        }

        const device = this.core.getDevice();
        const bytesPerPixel = 4;
        const unpaddedBytesPerRow = width * bytesPerPixel;
        const bytesPerRow = Math.ceil(unpaddedBytesPerRow / 256) * 256;
        const bufferSize = bytesPerRow * height;

        const readBuffer = device.createBuffer({
            label: "palette index readback buffer",
            size: bufferSize,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });

        const encoder = device.createCommandEncoder();
        encoder.copyTextureToBuffer(
            { texture: this.indexTexture },
            {
                buffer: readBuffer,
                bytesPerRow,
                rowsPerImage: height,
            },
            {
                width,
                height,
                depthOrArrayLayers: 1,
            },
        );

        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();

        await readBuffer.mapAsync(GPUMapMode.READ);
        const mappedRange = readBuffer.getMappedRange();
        const result = new Uint32Array(width * height);

        for (let y = 0; y < height; y++) {
            const row = new Uint32Array(mappedRange, y * bytesPerRow, width);
            result.set(row, y * width);
        }

        readBuffer.unmap();
        readBuffer.destroy();

        return result;
    }

    getCopicColourAtPixel(x: number, y: number): CopicColour | null {
        if (
            !this.paletteIndexData ||
            x < 0 ||
            y < 0 ||
            x >= this.paletteIndexWidth ||
            y >= this.paletteIndexHeight
        ) {
            return null;
        }

        const paletteIndex = this.paletteIndexData[y * this.paletteIndexWidth + x];
        return this.activePalette[paletteIndex] ?? null;
    }

    getQuantizedTexture(): ManagedTexture | null {
        return this.textureManager.getTexture("quantized") || null;
    }
}

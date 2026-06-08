import { WebGPUCore } from "./WebGPU.service";
import { RenderService } from "./Render.service";
import { TextureManagerService } from "./Textures.service";
import { KuwaharaService } from "./Kuwahara.service";
import { PaletteService } from "./Palettes.service";
import { ColourService } from "./Colours.service";
import { QuantizeService } from "./Quantize.service";
import { AdjustService } from "./Adjust.service";
import type { AdjustmentParams, CopicColour, KuwaharaParams } from "../types/types";

export class ImageEditorService {
    private webGPUCore: WebGPUCore;
    private renderer: RenderService;
    private textureManager: TextureManagerService;
    private kuwahara: KuwaharaService;
    private colourService: ColourService;
    private paletteService: PaletteService;
    private quantizeService: QuantizeService;
    private adjustService: AdjustService;

    private selectedPalette!: CopicColour[];
    private adjustmentParams: AdjustmentParams = {
        brightness: 0,
        contrast: 1.0,
        saturation: 1.0,
    };
    private quantizationEnabled = true;

    constructor() {
        this.webGPUCore = WebGPUCore.getInstance();
        this.renderer = new RenderService();
        this.textureManager = new TextureManagerService();
        this.colourService = ColourService.getInstance(this.textureManager);
        this.paletteService = new PaletteService(this.colourService);
        this.quantizeService = new QuantizeService(this.textureManager);
        this.kuwahara = new KuwaharaService(this.textureManager);
        this.adjustService = new AdjustService(this.textureManager);
    }

    async initialize(canvas: HTMLCanvasElement): Promise<void> {
        await this.webGPUCore.initialize(canvas);
        await this.renderer.initialize();
        await this.kuwahara.initialize();
        await this.colourService.initialize();
        await this.quantizeService.initialize();
        await this.adjustService.initialize();
    }

    async loadImage(imageFile: File | Blob): Promise<void> {
        this.textureManager.destroyAll();

        const managedTexture = await this.textureManager.createImageTexture(imageFile, "original");
        this.webGPUCore.configureContext(managedTexture.width, managedTexture.height);

        await this.colourService.convertTextureRgbToLab("original", "lab");

        this.selectedPalette = this.paletteService.getSelectedPalette();

        await this.adjustService.adjust("lab", "adjusted_lab", this.adjustmentParams);
        await this.colourService.convertTextureLabToRgb("adjusted_lab", "adjusted_rgb");

        if (this.quantizationEnabled) {
            await this.quantizeService.quantize(this.selectedPalette, "adjusted_lab");
            await this.colourService.convertTextureLabToRgb("quantized", "final_rgb_output");
        }

        this.render(this.getActiveTextureKey());
    }

    async updateAdjustments(params: AdjustmentParams, skipRender = false): Promise<void> {
        this.adjustmentParams = { ...params };
        await this.adjustService.adjust("lab", "adjusted_lab", this.adjustmentParams);
        await this.colourService.convertTextureLabToRgb("adjusted_lab", "adjusted_rgb");

        if (this.quantizationEnabled) {
            await this.quantizeService.quantize(this.selectedPalette, "adjusted_lab");
            await this.colourService.convertTextureLabToRgb("quantized", "final_rgb_output");
        }

        if (!skipRender) this.render(this.getActiveTextureKey());
    }

    async setQuantizationEnabled(enabled: boolean, skipRender = false): Promise<void> {
        this.quantizationEnabled = enabled;
        if (enabled) {
            await this.quantizeService.quantize(this.selectedPalette, "adjusted_lab");
            await this.colourService.convertTextureLabToRgb("quantized", "final_rgb_output");
        }
        if (!skipRender) this.render(this.getActiveTextureKey());
    }

    async runKuwaharaFilter(kuwaharaParams: KuwaharaParams): Promise<void> {
        await this.kuwahara.runKuwahara(kuwaharaParams, this.getActiveTextureKey());
        this.render("kuwahara_output");
    }

    renderFinalOutput(): void {
        this.render(this.getActiveTextureKey());
    }

    getCopicColourAtPixel(x: number, y: number): CopicColour | null {
        return this.quantizeService.getCopicColourAtPixel(x, y);
    }

    destroy(): void {
        this.textureManager.destroyAll();
        this.webGPUCore.destroy();
    }

    private getActiveTextureKey(): string {
        return this.quantizationEnabled ? "final_rgb_output" : "adjusted_rgb";
    }

    private render(textureKey = "original"): void {
        const managed = this.textureManager.getTexture(textureKey);
        if (managed) {
            this.renderer.render(managed.texture);
        } else {
            console.error(`No texture found with key: ${textureKey}`);
        }
    }
}

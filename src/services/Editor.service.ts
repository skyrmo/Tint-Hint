import { WebGPUCore } from "./WebGPU.service";
import { RenderService } from "./Render.service";
import { TextureManagerService } from "./Textures.service";
import { KuwaharaService } from "./Kuwahara.service";
import { PaletteService } from "./Palettes.service";
import { ColourService } from "./Colours.service";
import { QuantizeService } from "./Quantize.service";
import type { CopicColour, KuwaharaParams } from "../types/types";

export class ImageEditorService {
    private webGPUCore: WebGPUCore;
    private renderer: RenderService;
    private textureManager: TextureManagerService;
    private kuwahara: KuwaharaService;
    private colourService: ColourService;
    private paletteService: PaletteService;
    private quantizeService: QuantizeService;

    private selectedPalette!: CopicColour[];

    constructor() {
        this.webGPUCore = WebGPUCore.getInstance();
        this.renderer = new RenderService();
        this.textureManager = new TextureManagerService();
        this.colourService = ColourService.getInstance(this.textureManager);
        this.paletteService = new PaletteService(this.colourService);
        this.quantizeService = new QuantizeService(this.textureManager);
        this.kuwahara = new KuwaharaService(this.textureManager);
    }

    async initialize(canvas: HTMLCanvasElement): Promise<void> {
        await this.webGPUCore.initialize(canvas);
        await this.renderer.initialize();
        await this.kuwahara.initialize();
        await this.colourService.initialize();
        await this.quantizeService.initialize();
    }

    async loadImage(imageFile: File | Blob): Promise<void> {
        // Clear previous textures
        this.textureManager.destroyAll();

        // create new manage texztureand store it wih the key "original"
        const managedTexture = await this.textureManager.createImageTexture(imageFile, "original");

        // Update canvas size
        this.webGPUCore.configureContext(managedTexture.width, managedTexture.height);

        await this.colourService.convertTextureRgbToLab("original", "lab");

        this.selectedPalette = this.paletteService.getSelectedPalette();

        await this.quantizeService.quantize(this.selectedPalette, "lab");

        await this.colourService.convertTextureLabToRgb("quantized", "final_rgb_output");

        this.render("final_rgb_output");
    }

    async runKuwaharaFilter(kuwaharaParams: KuwaharaParams) {
        await this.kuwahara.runKuwahara(kuwaharaParams);
        // await this.colourService.convertTextureLabToRgb("kuwahara_output", "final_kuwahara_output");
        this.render("kuwahara_output");
    }

    private render(textureKey = "original"): void {
        // retrieve slected texture, based off provided key
        const managed = this.textureManager.getTexture(textureKey);

        if (managed) {
            this.renderer.render(managed.texture);
        } else {
            console.error(`No texture found with key: ${textureKey}`);
        }
    }

    getCopicColourAtPixel(x: number, y: number): CopicColour | null {
        return this.quantizeService.getCopicColourAtPixel(x, y);
    }

    destroy(): void {
        this.textureManager.destroyAll();
        this.webGPUCore.destroy();
    }
}

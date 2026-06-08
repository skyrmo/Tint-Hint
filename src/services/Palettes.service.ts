import type { CopicColour, CopicJsonData } from "../types/types";
import type { ColourService } from "./Colours.service";

export class PaletteService {
    private fullPalette: Map<string, CopicColour> = new Map();
    private selectedKeys: Set<string> = new Set();
    // private isInitialized: boolean = false;
    private coloursService: ColourService;

    constructor(coloursService: ColourService) {
        this.coloursService = coloursService;
        // Initialize asynchronously
        this.initialize();
    }

    private async initialize(): Promise<void> {
        try {
            // Fetch the copic.json file from the public directory
            const response = await fetch("/copic.json");

            if (!response.ok) {
                throw new Error("Failed to load Copic palette JSON data");
            }

            const data: CopicJsonData = await response.json();

            // Process each color from the JSON
            for (const color of data.colors) {
                // Convert RGB
                const rgb: [number, number, number] = [color.rgb[0], color.rgb[1], color.rgb[2]];

                // Use the code as the key to ensure uniqueness
                const key = `${color.code}`;

                this.fullPalette.set(key, {
                    code: color.code,
                    name: color.name,
                    hex: color.hex,
                    rgb: rgb,
                    lab: this.coloursService.rgbToLabCPU(rgb),
                });

                // Start with the colours i have in my collection.
                const defaultSelectedCodes = [
                    "RV21",
                    "RV23",
                    "RV06",

                    "R000",
                    "R00",
                    "R20",
                    "R30",
                    "R22",
                    "R24",
                    "R27",
                    "R37",

                    "YR000",
                    "YR00",
                    "YR02",
                    "YR15",
                    "YR04",

                    "Y00",
                    "Y11",
                    "Y04",
                    "Y06",
                    "Y15",

                    "YG11",
                    "YG61",
                    "YG17",
                    "YG63",
                    "YG09",
                    "YG67",

                    "G00",
                    "G02",
                    "G05",
                    "G07",
                    "G16",
                    "G28",
                    "G29",

                    "BG11",
                    "BG15",
                    "BG07",
                    "BG18",

                    "B00",
                    "B12",
                    "B04",
                    "B16",
                    "B24",
                    "B28",

                    "BV00",
                    "BV04",
                    "BV17",

                    "V12",
                    "V15",
                    "V17",
                    "V28",

                    "E000",
                    "E00",
                    "E11",
                    "E31",
                    "E40",
                    "E41",
                    "E42",
                    "E44",
                    "E50",
                    "E51",
                    "E93",
                    "E84",
                    "E47",
                    "E49",
                    "E57",

                    "N0",
                    // "N1",
                    "N2",
                    // "N3",
                    "N4",
                    // "N5",
                    "N6",
                    // "N7",
                    "N8",
                    // "N9",
                    "N10 ",

                    "0",
                    "100",
                ];

                if (defaultSelectedCodes.includes(color.code)) {
                    this.selectedKeys.add(key);
                }
            }
        } catch (error) {
            console.error("Error loading Copic palette:", error);
        }
    }

    getSelectedPalette(): CopicColour[] {
        return Array.from(this.fullPalette.entries())
            .filter(([key]) => this.selectedKeys.has(key))
            .map(([_, color]) => color);
    }

    // setSelectedColors(selectedPalette: Record<string, boolean>) {
    //     this.selectedKeys.clear();
    //     for (const [key, isSelected] of Object.entries(selectedPalette)) {
    //         if (isSelected) {
    //             this.selectedKeys.add(key);
    //         }
    //     }
    // }

    // getPossibleColours(): Array<CopicColor & { key: string }> {
    //     return Array.from(this.fullPalette.entries()).map(([key, color]) => ({
    //         ...color,
    //         key,
    //     }));
    // }

    // // Helper to get the selection state
    // getSelectionState(): Record<string, boolean> {
    //     const state: Record<string, boolean> = {};
    //     for (const key of this.fullPalette.keys()) {
    //         state[key] = this.selectedKeys.has(key);
    //     }
    //     return state;
    // }
}

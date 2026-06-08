@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

// D65 standard illuminant
const D65_X: f32 = 95.047;
const D65_Y: f32 = 100.000;
const D65_Z: f32 = 108.883;

// sRGB to linear RGB conversion
fn srgb_to_linear(c: f32) -> f32 {
    if (c <= 0.04045) {
        return c / 12.92;
    } else {
        return pow((c + 0.055) / 1.055, 2.4);
    }
}

// // Linear RGB to XYZ conversion matrix (sRGB primaries, D65 illuminant)
// fn linear_rgb_to_xyz(rgb: vec3<f32>) -> vec3<f32> {
//     let m = mat3x3<f32>(
//         vec3<f32>(0.4124564, 0.3575761, 0.1804375),
//         vec3<f32>(0.2126729, 0.7151522, 0.0721750),
//         vec3<f32>(0.0193339, 0.1191920, 0.9503041)
//     );
//     return m * rgb * 100.0; // Scale to 0-100 range
// }
// Linear RGB to XYZ conversion matrix (sRGB primaries, D65 illuminant)
fn linear_rgb_to_xyz(rgb: vec3<f32>) -> vec3<f32> {
    let m = mat3x3<f32>(
        vec3<f32>(0.4124564, 0.2126729, 0.0193339),  // First COLUMN (was first row)
        vec3<f32>(0.3575761, 0.7151522, 0.1191920),  // Second COLUMN
        vec3<f32>(0.1804375, 0.0721750, 0.9503041)   // Third COLUMN
    );
    return m * rgb * 100.0; // Scale to 0-100 range
}

// XYZ to Lab conversion helper
fn xyz_to_lab_component(t: f32) -> f32 {
    const delta: f32 = 6.0 / 29.0;
    const delta_sq: f32 = delta * delta;
    const delta_cb: f32 = delta_sq * delta;

    if (t > delta_cb) {
        return pow(t, 1.0 / 3.0);
    } else {
        return t / (3.0 * delta_sq) + (4.0 / 29.0);
    }
}

// XYZ to Lab conversion
fn xyz_to_lab(xyz: vec3<f32>) -> vec3<f32> {
    let x_n = xyz.x / D65_X;
    let y_n = xyz.y / D65_Y;
    let z_n = xyz.z / D65_Z;

    let fx = xyz_to_lab_component(x_n);
    let fy = xyz_to_lab_component(y_n);
    let fz = xyz_to_lab_component(z_n);

    let L = 116.0 * fy - 16.0;
    let a = 500.0 * (fx - fy);
    let b = 200.0 * (fy - fz);

    return vec3<f32>(L, a, b);
}

// Main RGB to Lab conversion
fn rgb_to_lab(rgb: vec3<f32>) -> vec3<f32> {
    // Step 1: sRGB to linear RGB
    let linear_rgb = vec3<f32>(
        srgb_to_linear(rgb.r),
        srgb_to_linear(rgb.g),
        srgb_to_linear(rgb.b)
    );

    // Step 2: Linear RGB to XYZ
    let xyz = linear_rgb_to_xyz(linear_rgb);

    // Step 3: XYZ to Lab
    return xyz_to_lab(xyz);
}

@compute @workgroup_size(8, 8, 1)
fn computeMain(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let dimensions = textureDimensions(inputTexture);
    let coords = vec2<i32>(i32(global_id.x), i32(global_id.y));

    // Check bounds using texture dimensions
    if (global_id.x >= dimensions.x || global_id.y >= dimensions.y) {
        return;
    }

    // Read RGB pixel from input texture
    let rgb_pixel = textureLoad(inputTexture, coords, 0);

    // Convert to Lab
    let lab = rgb_to_lab(rgb_pixel.rgb);

    // Store Lab values in output texture
    // Store actual Lab values without normalization for accuracy
    // L: 0-100, a: ~-127 to ~127, b: ~-127 to ~127
    let lab_output = vec4<f32>(
        lab.x,        // L: 0-100
        lab.y,        // a: typically -127 to 127
        lab.z,        // b: typically -127 to 127
        rgb_pixel.a   // Preserve alpha
    );

    textureStore(outputTexture, coords, lab_output);
}

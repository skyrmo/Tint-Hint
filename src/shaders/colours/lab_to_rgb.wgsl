@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var outputTexture: texture_storage_2d<rgba8unorm, write>;

// D65 standard illuminant
const D65_X: f32 = 95.047;
const D65_Y: f32 = 100.000;
const D65_Z: f32 = 108.883;

// Lab to XYZ conversion helper
// fn lab_to_xyz_component(t: f32) -> f32 {
//     const delta: f32 = 6.0 / 29.0;
//     const delta_sq: f32 = delta * delta;
//     const delta_cb: f32 = delta_sq * delta;

//     let t_cubed = t * t * t;
//     if (t_cubed > delta_cb) {
//         return t_cubed;
//     } else {
//         return (3.0 * delta_sq) * (t - (4.0 / 29.0));
//     }
// }
//
fn lab_to_xyz_component(t: f32) -> f32 {
    const delta: f32 = 6.0 / 29.0;
    const delta_sq: f32 = delta * delta;

    if (t > delta) {  // Changed from: t_cubed > delta_cb
        return t * t * t;
    } else {
        return (3.0 * delta_sq) * (t - (4.0 / 29.0));
    }
}

// Lab to XYZ conversion
fn lab_to_xyz(lab: vec3<f32>) -> vec3<f32> {
    let L = lab.x;
    let a = lab.y;
    let b = lab.z;

    let fy = (L + 16.0) / 116.0;
    let fx = a / 500.0 + fy;
    let fz = fy - b / 200.0;

    let x_n = lab_to_xyz_component(fx);
    let y_n = lab_to_xyz_component(fy);
    let z_n = lab_to_xyz_component(fz);

    let xyz = vec3<f32>(
        x_n * D65_X,
        y_n * D65_Y,
        z_n * D65_Z
    );

    return xyz / 100.0; // Scale back to 0-1 range
}

// // XYZ to linear RGB conversion matrix (inverse of sRGB primaries)
// fn xyz_to_linear_rgb(xyz: vec3<f32>) -> vec3<f32> {
//     let m = mat3x3<f32>(
//         vec3<f32>(3.2404542, -1.5371385, -0.4985314),
//         vec3<f32>(-0.9692660, 1.8760108, 0.0415560),
//         vec3<f32>(0.0556434, -0.2040259, 1.0572252)
//     );
//     return m * xyz;
// }
// XYZ to linear RGB conversion matrix (inverse of sRGB primaries)
fn xyz_to_linear_rgb(xyz: vec3<f32>) -> vec3<f32> {
    let m = mat3x3<f32>(
        vec3<f32>(3.2404542, -0.9692660, 0.0556434),   // First COLUMN (was first row)
        vec3<f32>(-1.5371385, 1.8760108, -0.2040259),  // Second COLUMN
        vec3<f32>(-0.4985314, 0.0415560, 1.0572252)    // Third COLUMN
    );
    return m * xyz;
}

// Linear RGB to sRGB conversion
fn linear_to_srgb(c: f32) -> f32 {
    if (c <= 0.0031308) {
        return 12.92 * c;
    } else {
        return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
    }
}

// Main Lab to RGB conversion
fn lab_to_rgb(lab: vec3<f32>) -> vec3<f32> {
    // Step 1: Lab to XYZ
    let xyz = lab_to_xyz(lab);

    // Step 2: XYZ to linear RGB
    let linear_rgb = xyz_to_linear_rgb(xyz);

    // Step 3: Linear RGB to sRGB
    let srgb = vec3<f32>(
        linear_to_srgb(linear_rgb.r),
        linear_to_srgb(linear_rgb.g),
        linear_to_srgb(linear_rgb.b)
    );

    return clamp(srgb, vec3<f32>(0.0), vec3<f32>(1.0));
}

@compute @workgroup_size(8, 8, 1)
fn computeMain(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let dimensions = textureDimensions(inputTexture);
    let coords = vec2<i32>(i32(global_id.x), i32(global_id.y));

    // Check bounds using texture dimensions
    if (global_id.x >= dimensions.x || global_id.y >= dimensions.y) {
        return;
    }

    // Read Lab pixel from input texture
    let lab_pixel = textureLoad(inputTexture, coords, 0);

    // Convert to RGB
    let rgb = lab_to_rgb(lab_pixel.rgb);

    // Store RGB values in output texture
    let rgb_output = vec4<f32>(
        rgb.x,         // R: 0-1
        rgb.y,         // G: 0-1
        rgb.z,         // B: 0-1
        lab_pixel.a    // Preserve alpha
    );

    textureStore(outputTexture, coords, rgb_output);
}

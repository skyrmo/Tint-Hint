struct AdjustmentParams {
    brightness : f32, // additive offset applied to L*
    contrast   : f32, // scale factor applied to L* around midpoint 50
    saturation : f32, // scale factor applied to a* and b* chroma axes
    _pad       : f32, // alignment padding
}

@group(0) @binding(0) var inputTexture  : texture_2d<f32>;
@group(0) @binding(1) var outputTexture : texture_storage_2d<rgba16float, write>;
@group(0) @binding(2) var<uniform>      params : AdjustmentParams;

@compute @workgroup_size(8, 8, 1)
fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
    let dims = textureDimensions(inputTexture);
    if (id.x >= dims.x || id.y >= dims.y) { return; }

    let coords = vec2<i32>(id.xy);
    let lab    = textureLoad(inputTexture, coords, 0);

    // Brightness: shift L* by a flat offset
    var L = lab.x + params.brightness;

    // Contrast: scale L* around the perceptual midpoint (50)
    L = (L - 50.0) * params.contrast + 50.0;

    // Clamp L* to the valid CIE range
    L = clamp(L, 0.0, 100.0);

    // Saturation: scale the chroma axes radially.
    // a* and b* are not clamped — the quantiser finds the nearest
    // palette entry regardless of whether they exceed typical gamut bounds.
    let a = lab.y * params.saturation;
    let b = lab.z * params.saturation;

    textureStore(outputTexture, coords, vec4<f32>(L, a, b, lab.w));
}

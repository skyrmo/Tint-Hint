struct Centroid {
    color: vec4<f32>, // RGB in xyz, unused in w
}

@group(0) @binding(0) var inputTexture: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> centroids: array<Centroid>;
@group(0) @binding(2) var outputTexture: texture_storage_2d<rgba16float, write>;
@group(0) @binding(3) var<uniform> numCentroids: vec4<u32>; // Only x component used
@group(0) @binding(4) var indexTexture: texture_storage_2d<r32uint, write>;

fn dist(a: vec3<f32>, b: vec3<f32>) -> f32 {
    let diff = a - b;
    return length(diff);
}

@compute @workgroup_size(8, 8, 1)
fn computeMain(@builtin(global_invocation_id) id: vec3<u32>) {
    let dimensions = textureDimensions(inputTexture);

    if (id.x >= dimensions.x || id.y >= dimensions.y) {
        return;
    }

    // Read the input pixel
    let pixel = textureLoad(inputTexture, vec2<i32>(id.xy), 0);
    let pixel_lab = pixel.rgb;

    // Find the closest centroid using HSL comparison
    var min_distance = 999999.0;
    var closest_idx = 0u;

    for (var i = 0u; i < numCentroids.x; i++) {
        let centroid_lab = centroids[i].color.rgb;

        let distance = dist(pixel_lab, centroid_lab);

        if (distance < min_distance) {
            min_distance = distance;
            closest_idx = i;
        }
    }

    // Output the LAB color of the closest palette colour and record its palette index.
    let output_color = vec4<f32>(centroids[closest_idx].color.rgb, pixel.a);
    textureStore(outputTexture, vec2<i32>(id.xy), output_color);
    textureStore(indexTexture, vec2<i32>(id.xy), vec4<u32>(closest_idx, 0u, 0u, 0u));
}

const SNAPSHOT_PATTERN = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;

export function captureCakePreview({ gl, scene, camera }) {
    if (gl.getContext().isContextLost()) throw new Error("The cake preview is still loading. Please try again.");
    // Read immediately after rendering so WebGL does not need a persistent
    // drawing buffer and the snapshot uses the exact visible scene and camera.
    gl.render(scene, camera);
    const image = gl.domElement.toDataURL("image/png");
    if (!SNAPSHOT_PATTERN.test(image)) throw new Error("The cake preview could not be captured. Please try again.");
    return image;
}

export function getCakePreviewImage(customization) {
    const image = customization?.topping_layout?._preview?.image;
    return typeof image === "string" && SNAPSHOT_PATTERN.test(image) ? image : null;
}

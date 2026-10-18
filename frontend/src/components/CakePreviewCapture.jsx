import { useLayoutEffect } from "react";
import { useThree } from "@react-three/fiber";
import { captureCakePreview } from "../utils/cakePreviewSnapshot.js";

export default function CakePreviewCapture({ captureRef }) {
    const { gl, scene, camera } = useThree();
    useLayoutEffect(() => {
        const capture = () => captureCakePreview({ gl, scene, camera });
        captureRef.current = capture;
        return () => { if (captureRef.current === capture) captureRef.current = null; };
    }, [gl, scene, camera, captureRef]);
    return null;
}

// src/components/admin/CakePreview3D.jsx
import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { CakeModel } from "../../pages/BuildBentoPage.jsx";
import { CAKE_SIZES, CustomizationProvider } from "../../contexts/Customization";

function PreviewLoadingFallback({ setIsReady }) {
    useEffect(() => {
        setIsReady(false);
    }, [setIsReady]);

    return null;
}

export default function CakePreview3D({ customization }) {
    const [isReady, setIsReady] = useState(false);

    const tierIndex = CAKE_SIZES.findIndex(
        t => t.tier === customization?.tier
    );

    const safeTierIndex = tierIndex === -1 ? 0 : tierIndex;

    return (
        <CustomizationProvider initialState={customization}>
            <div className="relative h-full w-full bg-[#FCF8EE]">
                {!isReady && (
                    <div
                        role="status"
                        aria-live="polite"
                        className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[#FCF8EE]/90"
                    >
                        <span className="sr-only">Loading custom cake preview</span>
                        <div className="h-20 w-20 animate-spin rounded-full border-[7px] border-[#F3E5D0] border-l-[#C05A11]" />
                    </div>
                )}
                <Canvas camera={{ fov: 40, position: [0, 4, 5] }}>

                    {/* lights */}
                    <ambientLight intensity={0.6} />
                    <directionalLight position={[5, 8, 5]} intensity={1.4} />
                    <pointLight position={[-4, 4, -4]} intensity={0.6} />
                    <pointLight position={[4, 2, 4]} intensity={0.4} />

                    {/* LANDMARK: now CakeModel reads REAL saved state */}
                    <ContactShadows
                        position={[0, -2.3, 0]}
                        opacity={0.5}
                        scale={6}
                        blur={2}
                    />

                    <Suspense fallback={<PreviewLoadingFallback setIsReady={setIsReady} />}>
                        <CakeModel selectedTierIndex={safeTierIndex} onReady={setIsReady} />
                        <Environment preset="city" />
                    </Suspense>

                    <OrbitControls
                        enablePan={false}
                        minDistance={3}
                        maxDistance={12}
                        minPolarAngle={Math.PI / 6}
                        maxPolarAngle={Math.PI / 2}
                        target={[0, 1.2, 0]}
                    />
                </Canvas>
            </div>
        </CustomizationProvider>
    );
}
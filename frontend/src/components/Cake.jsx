// src/components/Cake.jsx
import React, { useEffect, useMemo } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import { useCustomization } from "../contexts/Customization.jsx";
import {
    LinearEncoding,
    sRGBEncoding,
    LinearMipmapLinearFilter,
    LinearFilter
} from "three";
import { useThree } from '@react-three/fiber';
import * as THREE from "three";

export function Cake(props) {
    const { nodes, materials } = useGLTF('https://cake-assets-decc.patrickticoy78.workers.dev/tier1/tier1.gltf');
    const plate = useGLTF('https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/scene.gltf');
    const { flavor, flavorTextureMap, form, cakeColor, icingColor, nuts, chocolate, balls, candle, candleNumber } = useCustomization();
    const material = flavorTextureMap?.[flavor] || flavor;
    const { gl } = useThree();

    // Fix 1 — Clone stand materials instead of mutating
    const standMaterials = useMemo(() => {
        const stand_color = new THREE.Color('#2a2424');
        const meshNames = ['Mesh004', 'Mesh004_1', 'Mesh004_2', 'Mesh004_3'];
        const cloned = {};
        meshNames.forEach((meshName) => {
            if (nodes[meshName]?.material) {
                const mat = nodes[meshName].material.clone();
                mat.color = stand_color;
                cloned[meshName] = mat;
            }
        });
        return cloned;
    }, [nodes]);

    // Fix 2 — Realistic icing material with MeshPhysicalMaterial
    const creamMaterial = useMemo(() => {
        if (materials?.icing) {
            const mat = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color(icingColor.color),
                roughness: 0.12,
                metalness: 0.0,
                clearcoat: 0.6,
                clearcoatRoughness: 0.15,
                sheen: 0.3,
                sheenRoughness: 0.4,
                sheenColor: new THREE.Color(icingColor.color).multiplyScalar(1.3),
                envMapIntensity: 1.5,
                side: THREE.DoubleSide,
            });
            return mat;
        }
        return null;
    }, [materials, icingColor]);

    //Choco
    const coffeeTextureProps = useTexture({
        map: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/choco_chiffon/Abstract_Organic_007_basecolor.jpg",
        normalMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/choco_chiffon/Abstract_Organic_006_normal.jpg",
        roughnessMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/choco_chiffon/Abstract_Organic_006_roughness.jpg",
        aoMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/choco_chiffon/Abstract_Organic_006_ambientOcclusion.jpg",
    });

    //Vanilla
    const milkshakeTextureProps = useTexture({
        map: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/vanilla/vanilla/vanilla_chiffon_diffuse.jpg",
        normalMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/vanilla/vanilla/vanilla_chiffon_normal.jpg",
        aoMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/vanilla/vanilla/vanilla_chiffon_ao.jpg",
        //displacementMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/vanilla/vanilla_chiffon_height.jpg",
    });

    //Ube
    const abstractTextureProps = useTexture({
        map: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/ube/ube_chiffon_diffuseOriginal.jpg",
        normalMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/ube/ube_chiffon_normal.jpg",
        // displacementMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/ube/ube_chiffon_height.jpg",
        aoMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/ube/ube_chiffon_ao.jpg",
    });
    ;


    const textures = {
        'choco': abstractTextureProps,
        'vanilla': coffeeTextureProps,
        'ube': milkshakeTextureProps
    };

    useEffect(() => {
        const maxAnisotropy = gl.capabilities.getMaxAnisotropy();
        Object.values(textures).forEach((textureGroup) => {
            Object.keys(textureGroup).forEach((key) => {
                const texture = textureGroup[key];
                if (texture) {
                    texture.encoding = key === 'map' ? sRGBEncoding : LinearEncoding;
                    texture.anisotropy = maxAnisotropy;
                    texture.minFilter = LinearMipmapLinearFilter;
                    texture.magFilter = LinearFilter;
                    texture.generateMipmaps = true;
                }
            });
        });
    }, [gl]);

    return (
        <group {...props} dispose={null}>
            {/* Stand */}
            <group rotation={[Math.PI / 2, 0, 0]} scale={0.07}>
                <group position={[0, 0, -27.2]} scale={1.01}>
                    {nodes.Mesh004?.geometry && (
                        <mesh geometry={nodes.Mesh004.geometry} material={standMaterials['Mesh004']} castShadow />
                    )}
                    {nodes.Mesh004_1?.geometry && (
                        <mesh geometry={nodes.Mesh004_1.geometry} material={standMaterials['Mesh004_1']} castShadow />
                    )}
                    {nodes.Mesh004_2?.geometry && (
                        <mesh geometry={nodes.Mesh004_2.geometry} material={standMaterials['Mesh004_2']} castShadow />
                    )}
                    {nodes.Mesh004_3?.geometry && (
                        <mesh geometry={nodes.Mesh004_3.geometry} material={standMaterials['Mesh004_3']} castShadow />
                    )}
                </group>
            </group>

            {/* Heart Cake - form === 1 */}
            {nodes.Cake?.geometry && (
                <mesh
                    geometry={nodes.Cake.geometry}
                    position={[0, 1.89, 0]}
                    scale={[0.95, 0.92, 0.95]}
                    visible={form === 1}
                    castShadow
                >
                    <meshStandardMaterial {...textures[material]} color={cakeColor.color} />
                </mesh>
            )}

            {/* Rectangle Cake - form === 2 */}
            {nodes.Cake_Rectangle?.geometry && (
                <mesh
                    geometry={nodes.Cake_Rectangle.geometry}
                    position={[0, 0.2, 0]}
                    scale={[0.95, 0.92, 0.95]}
                    visible={form === 2}
                    castShadow
                >
                    <meshStandardMaterial {...textures[material]} color={cakeColor.color} />
                </mesh>
            )}

            {/* Plate */}
            {plate?.scene && (
                <group position={[0, -0.5, 0]} scale={[1.5, 1.5, 1.5]} rotation={[Math.PI / 2, 0, 0]}>
                    <primitive object={plate.scene} />
                </group>
            )}

            {/* Cream — uses realistic creamMaterial with side-drape positioning */}
            {nodes.icing_round?.geometry && (
                <mesh
                    geometry={nodes.icing_round.geometry}
                    material={creamMaterial}
                    position={[-0.012, -0.35, 0.001]}
                    scale={[1.02, 1.85, 1.02]}
                    visible={form === 1}
                    castShadow
                />
            )}
            {nodes.icing_rectangle?.geometry && (
                <mesh
                    geometry={nodes.icing_rectangle.geometry}
                    material={creamMaterial}
                    position={[0.008, -0.75, -0.0005]}
                    scale={[1.02, 1.75, 1.02]}
                    visible={form === 2}
                    castShadow
                />
            )}

            {/* Candle */}
            {candle && (
                <group position={[0, 2.35, 0.05]} scale={0.6}>
                    {String(candleNumber).split('').map((digit, index, arr) => {
                        const nodeName = `candle_${digit}`;
                        const offset = (index - (arr.length - 1) / 2) * 0.15; // spacing between digits
                        return nodes[nodeName]?.geometry ? (
                            <mesh
                                key={`${digit}-${index}`}
                                geometry={nodes[nodeName].geometry}
                                material={materials.Candle_White_Default || materials.Default}
                                position={[offset, 0, 0]}
                                rotation={nodes[nodeName].rotation}
                                scale={nodes[nodeName].scale}
                                castShadow
                            />
                        ) : null;
                    })}
                </group>
            )}

            {/* Nuts */}
            {nodes.Mesh021?.geometry && nodes.Mesh021_1?.geometry && (
                <group position={[0.08, 2.31, 0.42]} rotation={[Math.PI / 2, 0, -2.81]} scale={0.18} visible={nuts}>
                    <mesh geometry={nodes.Mesh021.geometry} material={materials.Default} />
                    <mesh geometry={nodes.Mesh021_1.geometry} material={materials.Default} />
                </group>
            )}

            {/* Chocolate Bar */}
            {nodes.bar?.geometry && (
                <mesh
                    geometry={nodes.bar.geometry}
                    material={materials.choco}
                    position={[0, 2.5, 0]}
                    rotation={[2.87, -0.55, -2.38]}
                    scale={0.1}
                    visible={chocolate}
                />
            )}

            {/* Balls */}
            {nodes.balls?.geometry && (
                <mesh
                    geometry={nodes.balls.geometry}
                    material={materials.balls}
                    position={[0.27, 2.44, -0.05]}
                    rotation={[-2.24, 0.35, -0.42]}
                    scale={-0.06}
                    visible={balls}
                />
            )}
        </group>
    );
}

useGLTF.preload('https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/scene.gltf');
useGLTF.preload('https://cake-assets-decc.patrickticoy78.workers.dev/tier1/tier1.gltf');
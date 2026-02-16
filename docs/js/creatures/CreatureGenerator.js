/**
 * THE GALACTIC ORDER - Procedural Alien Creature Generator
 *
 * Generates alien life forms using the same Superformula + CA Rule pipeline
 * that drives flora, rocks, and terrain. Every planet's creatures are
 * unique because they're derived from the planet's rule number.
 *
 * Architecture:
 * 1. CA Rule → Wolfram class → creature archetype (grazer, crawler, floater, etc.)
 * 2. Superformula → body parts (torso, head, limbs, appendages)
 * 3. Parts assembled into composite Three.js Group
 * 4. Procedural animation parameters derived from body proportions
 *
 * Creature Archetypes by Wolfram Class:
 *   Class 1 (Smooth): Gentle grazers — round bodies, short legs, slow
 *   Class 2 (Geometric): Crystal walkers — angular bodies, stiff gait
 *   Class 3 (Chaotic): Wild beasts — asymmetric, fast, unpredictable
 *   Class 4 (Complex): Elegant aliens — balanced, intricate, curious
 */

import * as THREE from 'three';
import { createSupershapeGeometry, normalizeGeometry } from '../generation/superformula.js';
import { deriveShapeParams, deriveShapeColors, deriveFeatureFlags } from '../generation/caShapeParams.js';
import { hashSeed, seededRandom } from '../generation/hashSeed.js';
import { classifyRule } from '../generation/cellularAutomata.js';

// ============================================================
// CREATURE ARCHETYPES
// ============================================================

const CREATURE_ARCHETYPES = {
    1: [ // Class 1 (Smooth): gentle, rounded creatures
        { name: 'blobGrazer',  bodyScale: [1, 0.7, 0.9], legCount: 4, legLength: 0.3, headSize: 0.4, speed: 0.5 },
        { name: 'puffBall',    bodyScale: [0.8, 0.8, 0.8], legCount: 0, legLength: 0, headSize: 0.3, speed: 0.3, floats: true },
        { name: 'slugCreeper', bodyScale: [1.3, 0.4, 0.6], legCount: 0, legLength: 0, headSize: 0.35, speed: 0.2 },
    ],
    2: [ // Class 2 (Geometric): angular, crystalline creatures
        { name: 'crystalStrider', bodyScale: [0.6, 1.0, 0.6], legCount: 4, legLength: 0.6, headSize: 0.3, speed: 0.7 },
        { name: 'prismHopper',    bodyScale: [0.5, 0.5, 0.5], legCount: 2, legLength: 0.5, headSize: 0.25, speed: 1.0 },
        { name: 'geoRoller',      bodyScale: [0.7, 0.7, 0.7], legCount: 0, legLength: 0, headSize: 0, speed: 0.6 },
    ],
    3: [ // Class 3 (Chaotic): wild, asymmetric creatures
        { name: 'chaosRunner',   bodyScale: [1.0, 0.5, 0.7], legCount: 6, legLength: 0.4, headSize: 0.35, speed: 1.5 },
        { name: 'tentacleBeast', bodyScale: [0.8, 0.6, 0.8], legCount: 5, legLength: 0.5, headSize: 0.4, speed: 0.8 },
        { name: 'sporeFlyer',    bodyScale: [0.5, 0.3, 0.5], legCount: 0, legLength: 0, headSize: 0.2, speed: 1.2, floats: true },
    ],
    4: [ // Class 4 (Complex): elegant, balanced creatures
        { name: 'elegantStrider', bodyScale: [0.7, 0.9, 0.7], legCount: 4, legLength: 0.7, headSize: 0.35, speed: 0.9 },
        { name: 'harmonicOrb',    bodyScale: [0.6, 0.6, 0.6], legCount: 0, legLength: 0, headSize: 0.3, speed: 0.5, floats: true },
        { name: 'treeWalker',     bodyScale: [0.5, 1.2, 0.5], legCount: 2, legLength: 0.8, headSize: 0.3, speed: 0.6 },
    ],
};

// ============================================================
// CREATURE GENERATOR
// ============================================================

/**
 * Generate a creature species definition for a planet.
 *
 * @param {number} ruleNumber - Planet's CA rule (0-255)
 * @param {number} seed - Planet seed
 * @param {number} speciesIndex - Which species (0-4)
 * @returns {{ mesh: THREE.Group, animParams: Object, archetype: Object, colors: Object }}
 */
export function generateCreatureSpecies(ruleNumber, seed, speciesIndex) {
    const cls = classifyRule(ruleNumber);
    const rng = seededRandom(ruleNumber, seed, 'creature', speciesIndex);
    const flags = deriveFeatureFlags(ruleNumber);

    // Pick archetype from this Wolfram class
    const archetypes = CREATURE_ARCHETYPES[cls.class] || CREATURE_ARCHETYPES[4];
    const archetype = archetypes[speciesIndex % archetypes.length];

    // Derive colors for this species
    const speciesSeed = hashSeed(seed, 'creature_species', speciesIndex);
    const colors = deriveShapeColors(ruleNumber, speciesSeed);

    // Derive body shape params
    const bodyParams = deriveShapeParams(ruleNumber, hashSeed(seed, 'cbody', speciesIndex), 'creature_body');
    const headParams = deriveShapeParams(ruleNumber, hashSeed(seed, 'chead', speciesIndex), 'creature_head');

    // Build the creature mesh
    const group = new THREE.Group();

    // --- BODY ---
    const bodyModifiers = {
        ...(bodyParams.modifiers || {}),
        noiseAmount: Math.max(bodyParams.modifiers?.noiseAmount || 0, 0.03),
    };
    let bodyGeo;
    try {
        bodyGeo = createSupershapeGeometry(bodyParams.params1, bodyParams.params2, 16, bodyModifiers);
        normalizeGeometry(bodyGeo);
    } catch (e) {
        bodyGeo = new THREE.IcosahedronGeometry(0.5, 1);
    }

    const bodyMat = _createCreatureMaterial(colors, flags, rng);
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.scale.set(...archetype.bodyScale);
    bodyMesh.castShadow = true;
    bodyMesh.name = 'body';
    bodyMesh.userData.partType = 'body';
    group.add(bodyMesh);

    // --- HEAD ---
    if (archetype.headSize > 0) {
        const headModifiers = {
            ...(headParams.modifiers || {}),
            twistAmount: 0, // Heads don't twist
            spineAmount: 0,
        };
        let headGeo;
        try {
            headGeo = createSupershapeGeometry(headParams.params1, headParams.params2, 12, headModifiers);
            normalizeGeometry(headGeo);
        } catch (e) {
            headGeo = new THREE.IcosahedronGeometry(0.5, 1);
        }

        const headMat = _createCreatureMaterial(colors, flags, rng, true);
        const headMesh = new THREE.Mesh(headGeo, headMat);

        const hs = archetype.headSize;
        headMesh.scale.setScalar(hs);

        // Position head at front-top of body
        const bodyH = archetype.bodyScale[1] * 0.5;
        const bodyZ = archetype.bodyScale[2] * 0.5;
        headMesh.position.set(0, bodyH * 0.6, bodyZ * 0.8 + hs * 0.3);
        headMesh.castShadow = true;
        headMesh.name = 'head';
        headMesh.userData.partType = 'head';
        group.add(headMesh);

        // --- EYES (small spheres on head) ---
        const eyeGeo = new THREE.SphereGeometry(hs * 0.12, 6, 4);
        const eyeMat = new THREE.MeshStandardMaterial({
            color: 0x111111,
            emissive: flags.hasEmissiveGlow ? new THREE.Color(colors.emissive[0], colors.emissive[1], colors.emissive[2]) : new THREE.Color(0x222233),
            emissiveIntensity: flags.hasEmissiveGlow ? 0.8 : 0.3,
            roughness: 0.1,
            metalness: 0.5,
        });

        const eyeSpread = hs * 0.25;
        let eyeIdx = 0;
        for (let side = -1; side <= 1; side += 2) {
            const eye = new THREE.Mesh(eyeGeo, eyeMat);
            eye.position.set(
                side * eyeSpread,
                headMesh.position.y + hs * 0.15,
                headMesh.position.z + hs * 0.35
            );
            eye.name = `eye_${eyeIdx}`;
            eye.userData.partType = 'eye';
            eye.userData.eyeIndex = eyeIdx;
            eyeIdx++;
            group.add(eye);
        }
    }

    // --- LEGS / APPENDAGES ---
    const legs = [];
    if (archetype.legCount > 0) {
        const legGeo = new THREE.CylinderGeometry(0.03, 0.04, archetype.legLength, 4, 2);
        // Slight curve
        const legPos = legGeo.getAttribute('position');
        for (let i = 0; i < legPos.count; i++) {
            const y = legPos.getY(i);
            const t = (y + archetype.legLength / 2) / archetype.legLength;
            legPos.setX(i, legPos.getX(i) + Math.pow(1 - t, 2) * 0.03);
        }
        legGeo.computeVertexNormals();

        const legMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colors.secondary[0], colors.secondary[1], colors.secondary[2]),
            roughness: 0.7,
            metalness: colors.metalness,
        });

        const bodyW = archetype.bodyScale[0] * 0.5;
        const bodyL = archetype.bodyScale[2] * 0.5;
        const legY = -archetype.bodyScale[1] * 0.4;

        for (let i = 0; i < archetype.legCount; i++) {
            const leg = new THREE.Mesh(legGeo, legMat);
            const angle = (i / archetype.legCount) * Math.PI * 2;
            const spreadX = Math.cos(angle) * bodyW * 0.8;
            const spreadZ = Math.sin(angle) * bodyL * 0.8;
            leg.position.set(spreadX, legY - archetype.legLength * 0.3, spreadZ);
            leg.castShadow = true;
            leg.name = `leg_${i}`;
            leg.userData.partType = 'leg';
            leg.userData.legIndex = i;
            group.add(leg);
            legs.push(leg);
        }
    }

    // --- TAIL / APPENDAGE (for some archetypes) ---
    if (rng() > 0.4 && archetype.legCount > 0) {
        const tailLen = 0.3 + rng() * 0.4;
        const tailGeo = new THREE.CylinderGeometry(0.02, 0.005, tailLen, 4, 3);
        // Curve the tail upward
        const tp = tailGeo.getAttribute('position');
        for (let i = 0; i < tp.count; i++) {
            const y = tp.getY(i);
            const t = (y + tailLen / 2) / tailLen;
            tp.setZ(i, tp.getZ(i) - Math.pow(t, 2) * tailLen * 0.3);
            tp.setY(i, tp.getY(i) + Math.pow(t, 2) * tailLen * 0.2);
        }
        tailGeo.computeVertexNormals();
        const tailMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(colors.primary[0], colors.primary[1], colors.primary[2]),
            roughness: 0.6,
        });
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.position.set(0, 0, -archetype.bodyScale[2] * 0.5);
        tail.rotation.x = -0.3;
        tail.name = 'tail';
        tail.userData.partType = 'tail';
        group.add(tail);
    }

    // Compute overall creature height for ground placement
    const totalHeight = archetype.bodyScale[1] * 0.5 +
        (archetype.legCount > 0 ? archetype.legLength : 0);

    // Animation parameters — derived from body proportions
    const animParams = {
        bobSpeed: archetype.floats ? 0.8 : 1.5 + rng() * 0.5,
        bobAmount: archetype.floats ? 0.15 : 0.03 + rng() * 0.03,
        swaySpeed: 0.7 + rng() * 0.5,
        swayAmount: 0.02 + rng() * 0.03,
        legCycleSpeed: archetype.speed * 3.0,
        floatHeight: archetype.floats ? 1.0 + rng() * 2.0 : 0,
        groundOffset: totalHeight,
        moveSpeed: archetype.speed * (1.5 + rng() * 1.0),
        turnSpeed: 1.0 + rng() * 1.5,
    };

    return {
        mesh: group,
        animParams,
        archetype,
        colors,
        legs,
        flags,
    };
}

// ============================================================
// CREATURE MATERIAL
// ============================================================

function _createCreatureMaterial(colors, flags, rng, isHead = false) {
    const baseColor = new THREE.Color(colors.primary[0], colors.primary[1], colors.primary[2]);
    const accentColor = colors.accent
        ? new THREE.Color(colors.accent[0], colors.accent[1], colors.accent[2])
        : baseColor.clone().multiplyScalar(0.7);

    // Head is slightly lighter/different tint
    if (isHead) {
        baseColor.lerp(new THREE.Color(1, 1, 1), 0.15);
    }

    const emissiveColor = flags.hasEmissiveGlow
        ? new THREE.Color(colors.emissive[0], colors.emissive[1], colors.emissive[2])
        : new THREE.Color(0, 0, 0);

    return new THREE.MeshStandardMaterial({
        color: baseColor,
        roughness: colors.roughness,
        metalness: colors.metalness,
        emissive: emissiveColor,
        emissiveIntensity: flags.hasEmissiveGlow ? 0.3 : 0,
        vertexColors: true,
        side: THREE.DoubleSide,
    });
}

// ============================================================
// GENERATE ALL SPECIES FOR A PLANET
// ============================================================

/**
 * Generate all creature species for a planet.
 *
 * @param {number} ruleNumber - Planet's CA rule
 * @param {number} seed - Planet seed
 * @param {number} [count=3] - Number of species
 * @returns {Object[]} Array of species definitions
 */
export function generatePlanetCreatures(ruleNumber, seed, count = 3) {
    const species = [];
    for (let i = 0; i < count; i++) {
        species.push(generateCreatureSpecies(ruleNumber, seed, i));
    }
    return species;
}

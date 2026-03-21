/**
 * THE GALACTIC ORDER — Shield Visual Effect
 *
 * Hexagonal energy shield that appears on impact:
 *   - Icosphere mesh at 1.1x ship bounding radius
 *   - Fresnel edge glow (always subtle, intensifies on hit)
 *   - Hexagonal grid pattern in fragment shader
 *   - Hit-point ripple effect expanding from impact location
 *   - Fades out over 0.5s after hit
 */

import * as THREE from 'three';

// ============================================================
// SHIELD SHADER
// ============================================================

const ShieldShader = {
    vertexShader: /* glsl */ `
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vViewDir;

        void main() {
            vNormal = normalize(normalMatrix * normal);
            vec4 worldPos = modelMatrix * vec4(position, 1.0);
            vWorldPos = worldPos.xyz;
            vViewDir = normalize(cameraPosition - worldPos.xyz);
            gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
    `,
    fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uTime;
        uniform float uHitIntensity;
        uniform vec3 uHitPoint;
        uniform float uHitTime;
        uniform float uShieldStrength;

        varying vec3 vNormal;
        varying vec3 vWorldPos;
        varying vec3 vViewDir;

        // Hexagonal grid
        vec2 hexGrid(vec2 p) {
            vec2 q = vec2(p.x * 2.0 / sqrt(3.0), p.y + p.x / sqrt(3.0));
            vec2 pi = floor(q);
            vec2 pf = fract(q);
            float v = mod(pi.x + pi.y, 3.0);
            float ca = step(1.0, v);
            float cb = step(2.0, v);
            vec2 ma = step(pf.xy, pf.yx);
            return pi + ca - cb * ma;
        }

        float hexDist(vec2 p) {
            vec2 h = hexGrid(p * 6.0);
            vec2 d = fract(vec2(h.x * 0.5 + h.y * 0.5, h.y) * vec2(1.0 / 3.0, 1.0 / 1.5));
            return length(d - 0.5);
        }

        void main() {
            // Fresnel edge glow
            float fresnel = 1.0 - abs(dot(vNormal, vViewDir));
            fresnel = pow(fresnel, 2.5);

            // Hexagonal pattern
            vec2 uv = vWorldPos.xz * 0.3 + vWorldPos.y * 0.2;
            float hex = hexDist(uv);
            float hexLine = smoothstep(0.35, 0.38, hex);

            // Hit ripple
            float hitDist = length(vWorldPos - uHitPoint);
            float hitAge = uTime - uHitTime;
            float ripple = 0.0;
            if (hitAge < 0.8 && hitAge > 0.0) {
                float ring = abs(hitDist - hitAge * 8.0);
                ripple = smoothstep(1.0, 0.0, ring) * (1.0 - hitAge / 0.8);
                ripple *= uHitIntensity;
            }

            // Combine
            float alpha = fresnel * 0.15 * uShieldStrength;     // Subtle always-on edge
            alpha += hexLine * 0.05 * uShieldStrength;          // Hex grid hint
            alpha += ripple * 0.8;                               // Hit flash
            alpha += uHitIntensity * fresnel * 0.3;             // Hit fresnel boost

            // Fade hit intensity
            vec3 color = uColor;
            color = mix(color, vec3(1.0), ripple * 0.5);        // White flash at hit point

            gl_FragColor = vec4(color, clamp(alpha, 0.0, 0.95));
        }
    `,
};

// ============================================================
// SHIELD EFFECT
// ============================================================

export class ShieldEffect {
    /**
     * @param {THREE.Group} shipGroup - Ship group to attach shield to
     * @param {number} radius - Ship bounding radius
     * @param {THREE.Color|number} [color=0x33aaff] - Shield color
     */
    constructor(shipGroup, radius, color = 0x33aaff) {
        this.shipGroup = shipGroup;
        this.shieldStrength = 1.0;

        // Shield mesh — icosphere slightly larger than ship
        const geo = new THREE.IcosahedronGeometry(radius * 1.15, 3);
        this.material = new THREE.ShaderMaterial({
            vertexShader: ShieldShader.vertexShader,
            fragmentShader: ShieldShader.fragmentShader,
            uniforms: {
                uColor: { value: new THREE.Color(color) },
                uTime: { value: 0 },
                uHitIntensity: { value: 0 },
                uHitPoint: { value: new THREE.Vector3() },
                uHitTime: { value: -10 },
                uShieldStrength: { value: 1.0 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });

        this.mesh = new THREE.Mesh(geo, this.material);
        this.mesh.renderOrder = 999; // Render after ship
        this.shipGroup.add(this.mesh);

        // Hit decay timer
        this._hitDecayRate = 2.0; // intensity units per second
    }

    /**
     * Register an impact on the shield.
     * @param {THREE.Vector3} worldPoint - Impact location in world space
     * @param {number} [intensity=1.0] - Impact strength 0-1
     */
    hit(worldPoint, intensity = 1.0) {
        this.material.uniforms.uHitPoint.value.copy(worldPoint);
        this.material.uniforms.uHitIntensity.value = Math.min(intensity, 1.0);
        this.material.uniforms.uHitTime.value = this.material.uniforms.uTime.value;
    }

    /**
     * Update shield effect.
     * @param {number} dt - Delta time
     * @param {number} time - Elapsed time
     * @param {number} [shieldStrength=1.0] - Current shield HP ratio 0-1
     */
    update(dt, time, shieldStrength = 1.0) {
        this.shieldStrength = shieldStrength;
        this.material.uniforms.uTime.value = time;
        this.material.uniforms.uShieldStrength.value = shieldStrength;

        // Decay hit intensity
        const hitIntensity = this.material.uniforms.uHitIntensity.value;
        if (hitIntensity > 0) {
            this.material.uniforms.uHitIntensity.value = Math.max(
                0, hitIntensity - this._hitDecayRate * dt
            );
        }

        // Show/hide based on whether there's anything to display
        this.mesh.visible = shieldStrength > 0;
    }

    /**
     * Set shield quality.
     * @param {string} detail - 'high', 'low', or 'off'
     */
    setQuality(detail) {
        if (detail === 'off') {
            this.mesh.visible = false;
        }
    }

    /** Dispose resources. */
    dispose() {
        this.mesh.geometry.dispose();
        this.material.dispose();
        this.shipGroup.remove(this.mesh);
    }
}

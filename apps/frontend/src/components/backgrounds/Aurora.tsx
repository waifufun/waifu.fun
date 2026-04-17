"use client";
// @ts-nocheck
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef } from "react";

interface AuroraProps {
	colorStops?: string[];
	amplitude?: number;
	blend?: number;
	speed?: number;
	time?: number | undefined;
}

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );
  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \\
  int index = 0;                                            \\
  for (int i = 0; i < 2; i++) {                               \\
     ColorStop currentColor = colors[i];                    \\
     bool isInBetween = currentColor.position <= factor;    \\
     index = int(mix(float(index), float(i), float(isInBetween))); \\
  }                                                         \\
  ColorStop currentColor = colors[index];                   \\
  ColorStop nextColor = colors[index + 1];                  \\
  float range = nextColor.position - currentColor.position; \\
  float lerpFactor = (factor - currentColor.position) / range; \\
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \\
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`;

export default function Aurora({
	colorStops = ["#00ff87", "#065f46", "#00ff87"],
	amplitude = 1.0,
	blend = 0.5,
	speed = 1.0,
	time,
}: AuroraProps) {
	const propsRef = useRef<AuroraProps>({ colorStops, amplitude, blend, speed, time });
	propsRef.current = { colorStops, amplitude, blend, speed, time };
	const ctnDom = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const ctn = ctnDom.current;
		if (!ctn) return;

		const renderer = new Renderer({
			alpha: true,
			premultipliedAlpha: true,
			antialias: true,
		});
		const gl = renderer.gl;
		// Dark clear color prevents white flash on resize/first frame (e.g. ~4–5s delayed resize)
		gl.clearColor(8 / 255, 8 / 255, 10 / 255, 1);
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
		const canvasEl = gl.canvas as HTMLCanvasElement;
		canvasEl.style.backgroundColor = "#08080a";

		const geometry = new Triangle(gl);
		const geometryWithAttributes = geometry as Triangle & { attributes?: Record<string, unknown> };
		if (geometryWithAttributes.attributes?.uv) {
			delete geometryWithAttributes.attributes.uv;
		}

		const colorStopsArray = (propsRef.current.colorStops ?? colorStops).map((hex: string) => {
			const c = new Color(hex);
			return [c.r, c.g, c.b];
		});

		const program = new Program(gl, {
			vertex: VERT,
			fragment: FRAG,
			uniforms: {
				uTime: { value: 0 },
				uAmplitude: { value: amplitude },
				uColorStops: { value: colorStopsArray },
				uResolution: { value: [ctn.offsetWidth, ctn.offsetHeight] },
				uBlend: { value: blend },
			},
		});

		function resize() {
			if (!ctn) return;
			const width = ctn.offsetWidth;
			const height = ctn.offsetHeight;
			renderer.setSize(width, height);
			canvasEl.style.backgroundColor = "#08080a";
			program.uniforms.uResolution.value = [width, height];
		}
		window.addEventListener("resize", resize);

		const mesh = new Mesh(gl, { geometry, program });
		ctn.appendChild(gl.canvas as HTMLCanvasElement);

		let animateId = 0;
		const update = (t: number) => {
			animateId = requestAnimationFrame(update);
			const currentTime = propsRef.current.time ?? t * 0.01;
			const currentSpeed = propsRef.current.speed ?? 1.0;
			program.uniforms.uTime.value = currentTime * currentSpeed * 0.1;
			program.uniforms.uAmplitude.value = propsRef.current.amplitude ?? 1.0;
			program.uniforms.uBlend.value = propsRef.current.blend ?? blend;

			const stops = propsRef.current.colorStops ?? colorStops;
			program.uniforms.uColorStops.value = stops.map((hex: string) => {
				const c = new Color(hex);
				return [c.r, c.g, c.b];
			});
			renderer.render({ scene: mesh });
		};
		animateId = requestAnimationFrame(update);
		resize();

		return () => {
			cancelAnimationFrame(animateId);
			window.removeEventListener("resize", resize);
			const canvas = gl.canvas as HTMLCanvasElement;
			if (ctn && canvas.parentNode === ctn) {
				ctn.removeChild(canvas);
			}
			gl.getExtension("WEBGL_lose_context")?.loseContext();
		};
	}, [amplitude, blend, colorStops]);

	return <div ref={ctnDom} style={{ width: "100%", height: "100%", backgroundColor: "#08080a" }} />;
}

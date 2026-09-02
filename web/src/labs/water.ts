import type { LabViewport } from './runtime';

export const MAX_REACTIVE_WATER_RIPPLES = 8;

export interface ReactiveWaterRipple {
  x: number;
  y: number;
  start: number;
  duration: number;
  strength: number;
}

export interface PackedWaterRipples {
  count: number;
  values: Float32Array;
}

export function packWaterRipples(
  ripples: readonly ReactiveWaterRipple[],
  now: number,
  width: number,
  height: number,
): PackedWaterRipples {
  const active = ripples
    .filter((ripple) => now >= ripple.start && now < ripple.start + ripple.duration)
    .sort((left, right) => right.start - left.start)
    .slice(0, MAX_REACTIVE_WATER_RIPPLES);
  const values = new Float32Array(MAX_REACTIVE_WATER_RIPPLES * 4);
  active.forEach((ripple, index) => {
    const age = Math.max(0, now - ripple.start);
    const remaining = 1 - age / Math.max(1, ripple.duration);
    const offset = index * 4;
    values[offset] = ripple.x / Math.max(1, width);
    values[offset + 1] = 1 - ripple.y / Math.max(1, height);
    values[offset + 2] = age / 1_000;
    values[offset + 3] = ripple.strength * Math.sqrt(Math.max(0, remaining));
  });
  return { count: active.length, values };
}

export const WATER_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

export const WATER_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 out_color;

uniform sampler2D u_texture;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_motion;
uniform float u_burst;
uniform int u_ripple_count;
uniform vec4 u_ripples[${MAX_REACTIVE_WATER_RIPPLES}];

void main() {
  float aspect = u_resolution.x / max(1.0, u_resolution.y);
  vec2 p = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);
  float t = u_time * u_motion;

  vec2 normal = vec2(
    cos(p.x * 25.0 + p.y * 7.0 + t * 0.72) * 0.13 +
    cos(p.x * 9.0 - p.y * 21.0 - t * 0.44) * 0.08,
    sin(p.y * 27.0 - p.x * 5.0 - t * 0.59) * 0.12 +
    sin(p.y * 11.0 + p.x * 17.0 + t * 0.37) * 0.07
  );
  float foam = 0.0;
  for (int index = 0; index < ${MAX_REACTIVE_WATER_RIPPLES}; index += 1) {
    if (index >= u_ripple_count) break;
    vec4 ripple = u_ripples[index];
    vec2 center = vec2((ripple.x - 0.5) * aspect, ripple.y - 0.5);
    vec2 delta = p - center;
    float distance_to_center = max(0.001, length(delta));
    float front = distance_to_center * 92.0 - ripple.z * 8.8;
    float envelope = exp(-distance_to_center * 7.5) * exp(-ripple.z * 0.44) * ripple.w;
    float ring = cos(front) * envelope;
    normal += (delta / distance_to_center) * ring * 0.72;
    float positive_ring = max(0.0, ring);
    foam += positive_ring * positive_ring * positive_ring * 0.75;
  }

  vec2 distortion = normal * (0.007 + u_burst * 0.0015);
  vec2 slow_flow = vec2(t * 0.0035, -t * 0.0022);
  vec3 detail_a = texture(u_texture, fract(v_uv + slow_flow + distortion)).rgb;
  vec3 detail_b = texture(u_texture, fract(v_uv * 1.73 - slow_flow.yx - distortion * 0.55)).rgb;
  float fine_wave = sin((p.x + p.y) * 43.0 + t * 1.05 + normal.x * 5.0) * 0.5 + 0.5;
  float caustic = pow(clamp(fine_wave * 0.64 + detail_b.g * 0.52, 0.0, 1.0), 5.0);

  vec3 deep = vec3(0.008, 0.055, 0.072);
  vec3 teal = vec3(0.025, 0.18, 0.20);
  vec3 water = mix(deep, teal, clamp(detail_a.g * 0.72 + detail_b.b * 0.28, 0.0, 1.0));
  float moon = pow(max(0.0, dot(normalize(vec3(-normal, 1.0)), normalize(vec3(-0.42, 0.58, 0.92)))), 26.0);
  water += vec3(0.19, 0.54, 0.52) * caustic * 0.42;
  water += vec3(0.56, 0.88, 0.82) * moon * 0.28;
  water += vec3(0.56, 0.96, 0.91) * min(1.0, foam) * 0.52;

  float edge_depth = 1.0 - smoothstep(0.28, 0.86, length(vec2((v_uv.x - 0.5) * 0.78, v_uv.y - 0.5)));
  water *= 0.72 + edge_depth * 0.34;
  out_color = vec4(water, 1.0);
}`;

export class ReactiveWaterSurface {
  readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly buffer: WebGLBuffer;
  private readonly texture: WebGLTexture;
  private readonly image: HTMLImageElement;
  private readonly uniforms: {
    texture: WebGLUniformLocation;
    resolution: WebGLUniformLocation;
    time: WebGLUniformLocation;
    motion: WebGLUniformLocation;
    burst: WebGLUniformLocation;
    rippleCount: WebGLUniformLocation;
    ripples: WebGLUniformLocation;
  };
  private textureReady = false;
  private width = 1;
  private height = 1;

  static create(stage: HTMLElement, image: HTMLImageElement): ReactiveWaterSurface | undefined {
    const canvas = document.createElement('canvas');
    canvas.className = 'lab-canvas lab-water-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return undefined;
    try {
      const surface = new ReactiveWaterSurface(canvas, gl, image);
      stage.append(canvas);
      return surface;
    } catch {
      canvas.remove();
      return undefined;
    }
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext, image: HTMLImageElement) {
    this.canvas = canvas;
    this.gl = gl;
    this.image = image;
    this.program = createProgram(gl, WATER_VERTEX_SHADER, WATER_FRAGMENT_SHADER);
    const buffer = gl.createBuffer();
    const texture = gl.createTexture();
    if (!buffer || !texture) throw new Error('WebGL water resources are unavailable');
    this.buffer = buffer;
    this.texture = texture;
    this.uniforms = {
      texture: uniform(gl, this.program, 'u_texture'),
      resolution: uniform(gl, this.program, 'u_resolution'),
      time: uniform(gl, this.program, 'u_time'),
      motion: uniform(gl, this.program, 'u_motion'),
      burst: uniform(gl, this.program, 'u_burst'),
      rippleCount: uniform(gl, this.program, 'u_ripple_count'),
      ripples: uniform(gl, this.program, 'u_ripples[0]'),
    };
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([3, 23, 29, 255]));
    image.addEventListener('load', this.uploadTexture, { once: true });
    if (image.complete && image.naturalWidth > 0) this.uploadTexture();
  }

  resize(viewport: LabViewport): void {
    this.width = Math.max(1, viewport.width);
    this.height = Math.max(1, viewport.height);
    // One render pixel per CSS pixel keeps water detailed without paying the
    // two-to-four-times Retina cost of the crisp packet overlay above it.
    const pixelRatio = Math.min(viewport.pixelRatio, 1);
    this.canvas.width = Math.round(this.width * pixelRatio);
    this.canvas.height = Math.round(this.height * pixelRatio);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  render(now: number, ripples: readonly ReactiveWaterRipple[], reducedMotion: boolean, burst: boolean): void {
    const gl = this.gl;
    const packed = packWaterRipples(ripples, now, this.width, this.height);
    if (!this.textureReady && this.image.complete && this.image.naturalWidth > 0) this.uploadTexture();
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.uniforms.texture, 0);
    gl.uniform2f(this.uniforms.resolution, this.width, this.height);
    gl.uniform1f(this.uniforms.time, now / 1_000);
    gl.uniform1f(this.uniforms.motion, reducedMotion ? 0 : 1);
    gl.uniform1f(this.uniforms.burst, burst ? 1 : 0);
    gl.uniform1i(this.uniforms.rippleCount, packed.count);
    gl.uniform4fv(this.uniforms.ripples, packed.values);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy(): void {
    this.image.removeEventListener('load', this.uploadTexture);
    this.gl.deleteTexture(this.texture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.canvas.remove();
  }

  private readonly uploadTexture = (): void => {
    if (!this.image.complete || this.image.naturalWidth === 0) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);
    this.textureReady = true;
  };
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = createShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL water program is unavailable');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'WebGL water program did not link';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function createShader(gl: WebGL2RenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error('WebGL water shader is unavailable');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'WebGL water shader did not compile';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function uniform(gl: WebGL2RenderingContext, program: WebGLProgram, name: string): WebGLUniformLocation {
  const location = gl.getUniformLocation(program, name);
  if (!location) throw new Error(`WebGL water uniform ${name} is unavailable`);
  return location;
}

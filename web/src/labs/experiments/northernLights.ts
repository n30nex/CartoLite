import { PACKET_KIND_COLORS } from '../../trafficVisuals';
import type { EndpointV2 } from '../../types';
import { CanvasSurface, lerp, rgba } from '../canvas';
import { clamp, type LabContext, type LabExperiment, type LabPacket, type LabPoint, type LabViewport } from '../runtime';

const VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0); }
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_energy;
uniform vec3 u_color;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  float horizon = 0.56 + sin(uv.x * 8.0 + u_time * 0.22) * 0.055 + sin(uv.x * 19.0 - u_time * 0.13) * 0.022;
  float ribbon = exp(-pow((uv.y - horizon) / 0.075, 2.0));
  float curtain = 0.42 + 0.58 * sin(uv.x * 42.0 + sin(uv.y * 12.0) + u_time * 0.34);
  float shimmer = ribbon * curtain * clamp(u_energy, 0.0, 1.4);
  vec3 base = mix(vec3(0.018, 0.055, 0.075), vec3(0.01, 0.025, 0.045), uv.y);
  vec3 color = base + u_color * shimmer * 0.42 + vec3(0.12, 0.30, 0.28) * shimmer * 0.18;
  outColor = vec4(color, 1.0);
}
`;

interface Ribbon {
  points: LabPoint[];
  start: number;
  duration: number;
  color: string;
  observer: boolean;
}

class NorthernLights implements LabExperiment {
  private context?: LabContext;
  private glCanvas?: HTMLCanvasElement;
  private gl?: WebGL2RenderingContext;
  private program?: WebGLProgram;
  private overlay?: CanvasSurface;
  private viewport: LabViewport = { width: 1, height: 1, pixelRatio: 1 };
  private ribbons: Ribbon[] = [];
  private energy = 0;
  private color: [number, number, number] = [0.3, 0.91, 0.77];
  private paused = false;

  private readonly onContextLost = (event: Event): void => {
    event.preventDefault();
    this.gl = undefined;
    this.program = undefined;
    if (this.context) this.context.stage.dataset.renderer = 'canvas-fallback';
  };

  private readonly onContextRestored = (): void => {
    this.initializeGL();
    this.resize(this.viewport);
  };

  mount(context: LabContext): void {
    this.context = context;
    const canvas = document.createElement('canvas');
    canvas.className = 'lab-canvas lab-aurora-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    context.stage.append(canvas);
    this.glCanvas = canvas;
    this.initializeGL();
    this.overlay = new CanvasSurface(context.stage, 'lab-canvas lab-overlay-canvas');
  }

  applySnapshot(): void {}

  handlePacket(packet: LabPacket): void {
    if (!this.context || this.paused) return;
    const color = PACKET_KIND_COLORS[packet.kind];
    this.color = rgb(color);
    this.energy = Math.min(1.4, this.energy + 0.08 + packet.hopCount * 0.025);
    const points = packet.mode === 'route'
      ? [packet.hops[0]?.from, ...packet.hops.map((hop) => hop.to)]
        .filter((point): point is EndpointV2 => point !== undefined)
        .map((point) => this.context!.project(point))
      : packet.observer ? [this.context.project(packet.observer)] : [];
    const duration = packet.mode === 'route' ? Math.max(8_000, packet.hopCount * 720 + 2_400) : 8_000;
    this.ribbons.push({ points, start: performance.now(), duration, color, observer: packet.mode === 'observer' });
    if (this.ribbons.length > 160) this.ribbons.splice(0, this.ribbons.length - 160);
  }

  resize(viewport: LabViewport): void {
    if (this.viewport.width > 1 && (this.viewport.width !== viewport.width || this.viewport.height !== viewport.height)) {
      this.ribbons = [];
    }
    this.viewport = viewport;
    if (this.glCanvas) {
      this.glCanvas.width = Math.round(viewport.width * viewport.pixelRatio);
      this.glCanvas.height = Math.round(viewport.height * viewport.pixelRatio);
      this.glCanvas.style.width = `${viewport.width}px`;
      this.glCanvas.style.height = `${viewport.height}px`;
      this.gl?.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
    }
    this.overlay?.resize(viewport);
  }

  frame(now: number, deltaMS: number): void {
    if (!this.context || !this.overlay || this.paused) return;
    this.energy *= Math.exp(-Math.min(100, deltaMS) / 8_000);
    this.drawAurora(now);
    this.drawRibbons(now);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  reset(): void {
    this.ribbons = [];
    this.energy = 0;
  }

  destroy(): void {
    this.reset();
    if (this.gl && this.program) this.gl.deleteProgram(this.program);
    this.glCanvas?.removeEventListener('webglcontextlost', this.onContextLost);
    this.glCanvas?.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.glCanvas?.remove();
    this.overlay?.destroy();
    this.glCanvas = undefined;
    this.overlay = undefined;
    this.gl = undefined;
    this.program = undefined;
    this.context = undefined;
  }

  private initializeGL(): void {
    const gl = this.glCanvas?.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' }) ?? undefined;
    if (!gl) {
      if (this.context) this.context.stage.dataset.renderer = 'canvas-fallback';
      return;
    }
    try {
      this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      this.gl = gl;
      if (this.context) this.context.stage.dataset.renderer = 'webgl2';
    } catch {
      this.gl = undefined;
      this.program = undefined;
      if (this.context) this.context.stage.dataset.renderer = 'canvas-fallback';
    }
  }

  private drawAurora(now: number): void {
    const gl = this.gl;
    const program = this.program;
    const canvas = this.glCanvas;
    if (!gl || !program || !canvas) return;
    gl.useProgram(program);
    gl.uniform2f(gl.getUniformLocation(program, 'u_resolution'), canvas.width, canvas.height);
    gl.uniform1f(gl.getUniformLocation(program, 'u_time'), this.context?.reducedMotion() ? 0 : now / 1_000);
    gl.uniform1f(gl.getUniformLocation(program, 'u_energy'), this.energy);
    gl.uniform3f(gl.getUniformLocation(program, 'u_color'), ...this.color);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawRibbons(now: number): void {
    const surface = this.overlay!;
    const canvas = surface.context;
    canvas.clearRect(0, 0, surface.width, surface.height);
    if (!this.gl) {
      const background = canvas.createLinearGradient(0, 0, 0, surface.height);
      background.addColorStop(0, '#061721');
      background.addColorStop(1, '#07121d');
      canvas.fillStyle = background;
      canvas.fillRect(0, 0, surface.width, surface.height);
    }
    this.ribbons = this.ribbons.filter((ribbon) => now - ribbon.start <= ribbon.duration);
    const reducedMotion = this.context!.reducedMotion();
    for (const ribbon of this.ribbons) {
      const age = now - ribbon.start;
      const alpha = clamp(1 - age / ribbon.duration, 0, 1);
      if (ribbon.observer && ribbon.points[0]) {
        const point = ribbon.points[0];
        canvas.strokeStyle = rgba(ribbon.color, alpha * 0.75);
        canvas.lineWidth = 1.5;
        canvas.beginPath();
        canvas.arc(point.x, point.y, reducedMotion ? 9 : 5 + age * 0.01, 0, Math.PI * 2);
        canvas.stroke();
        continue;
      }
      for (let index = 1; index < ribbon.points.length; index += 1) {
        const from = ribbon.points[index - 1]!;
        const to = ribbon.points[index]!;
        const progress = reducedMotion ? 1 : clamp((age - (index - 1) * 720) / 720, 0, 1);
        if (progress <= 0) continue;
        const endX = lerp(from.x, to.x, progress);
        const endY = lerp(from.y, to.y, progress);
        canvas.save();
        canvas.strokeStyle = rgba(ribbon.color, alpha * 0.68);
        canvas.lineWidth = 1.6;
        canvas.shadowColor = ribbon.color;
        canvas.shadowBlur = 12;
        canvas.beginPath();
        canvas.moveTo(from.x, from.y);
        canvas.lineTo(endX, endY);
        canvas.stroke();
        canvas.fillStyle = rgba(ribbon.color, alpha);
        canvas.beginPath();
        canvas.arc(endX, endY, 2.2, 0, Math.PI * 2);
        canvas.fill();
        canvas.restore();
      }
    }
  }
}

function createProgram(gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Could not create WebGL program');
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? 'WebGL link failed';
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create WebGL shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? 'WebGL compile failed';
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function rgb(color: string): [number, number, number] {
  const value = Number.parseInt(color.replace('#', ''), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

export function createExperiment(): LabExperiment {
  return new NorthernLights();
}

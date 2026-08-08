import type { InputState } from "./InputState";

export interface InputManagerCallbacks {
  onJump: () => void;
  onPunch: () => void;
  onCameraStart: () => void;
  onCameraMove: (deltaX: number, deltaY: number) => void;
  onCameraEnd: () => void;
}

const MOVEMENT_CODES = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "Space",
  "KeyF",
  "KeyJ",
]);

export class InputManager {
  readonly state: InputState = {
    moveX: 0,
    moveY: 0,
    cameraX: 0,
    cameraY: 0,
    jumpPressed: false,
    punchPressed: false,
    groundPoundRequested: false,
  };

  private readonly keys = new Set<string>();
  private virtualMoveX = 0;
  private virtualMoveY = 0;
  private virtualMoveActive = false;
  private windowTarget: Window | null = null;
  private surface: HTMLElement | null = null;
  private cameraPointerId: number | null = null;
  private cameraPointerX = 0;
  private cameraPointerY = 0;
  private lastTapAt = 0;

  constructor(private readonly callbacks: InputManagerCallbacks) {}

  attach(windowTarget: Window, surface: HTMLElement): void {
    this.windowTarget = windowTarget;
    this.surface = surface;
    windowTarget.addEventListener("keydown", this.handleKeyDown);
    windowTarget.addEventListener("keyup", this.handleKeyUp);
    windowTarget.addEventListener("blur", this.handleWindowBlur);
    surface.addEventListener("pointerdown", this.handlePointerDown, { passive: false });
    surface.addEventListener("pointermove", this.handlePointerMove, { passive: false });
    surface.addEventListener("pointerup", this.handlePointerUp, { passive: false });
    surface.addEventListener("pointercancel", this.handlePointerUp, { passive: false });
  }

  detach(): void {
    this.windowTarget?.removeEventListener("keydown", this.handleKeyDown);
    this.windowTarget?.removeEventListener("keyup", this.handleKeyUp);
    this.windowTarget?.removeEventListener("blur", this.handleWindowBlur);
    this.surface?.removeEventListener("pointerdown", this.handlePointerDown);
    this.surface?.removeEventListener("pointermove", this.handlePointerMove);
    this.surface?.removeEventListener("pointerup", this.handlePointerUp);
    this.surface?.removeEventListener("pointercancel", this.handlePointerUp);
    this.windowTarget = null;
    this.surface = null;
    this.keys.clear();
    this.cameraPointerId = null;
  }

  setMoveInput(x: number, y: number): void {
    const clampedX = Math.max(-1, Math.min(1, x));
    const clampedY = Math.max(-1, Math.min(1, y));
    this.virtualMoveX = clampedX;
    this.virtualMoveY = clampedY;
    this.virtualMoveActive = Math.hypot(clampedX, clampedY) > 0.01;
  }

  update(): InputState {
    const keyboardX =
      (this.keys.has("KeyD") || this.keys.has("ArrowRight") ? 1 : 0) -
      (this.keys.has("KeyA") || this.keys.has("ArrowLeft") ? 1 : 0);
    const keyboardY =
      (this.keys.has("KeyS") || this.keys.has("ArrowDown") ? 1 : 0) -
      (this.keys.has("KeyW") || this.keys.has("ArrowUp") ? 1 : 0);
    const x = this.virtualMoveActive ? this.virtualMoveX : keyboardX;
    const y = this.virtualMoveActive ? this.virtualMoveY : keyboardY;
    const length = Math.hypot(x, y);
    this.state.moveX = length > 1 ? x / length : x;
    this.state.moveY = length > 1 ? y / length : y;
    this.state.cameraX = 0;
    this.state.cameraY = 0;
    this.state.jumpPressed = false;
    this.state.punchPressed = false;
    this.state.groundPoundRequested = false;
    return this.state;
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (MOVEMENT_CODES.has(event.code)) event.preventDefault();
    this.keys.add(event.code);
    if (event.repeat) return;
    if (event.code === "Space") this.callbacks.onJump();
    if (event.code === "KeyF" || event.code === "KeyJ") this.callbacks.onPunch();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly handleWindowBlur = (): void => {
    this.keys.clear();
    this.setMoveInput(0, 0);
    this.endCameraPointer();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    event.preventDefault();
    const surface = this.surface;
    if (!surface) return;
    const rect = surface.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    if (localX > rect.width * 0.52) {
      this.cameraPointerId = event.pointerId;
      this.cameraPointerX = event.clientX;
      this.cameraPointerY = event.clientY;
      surface.setPointerCapture(event.pointerId);
      this.callbacks.onCameraStart();
      return;
    }
    const now = performance.now();
    if (now - this.lastTapAt < 280) return;
    this.lastTapAt = now;
    this.callbacks.onPunch();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.cameraPointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - this.cameraPointerX;
    const deltaY = event.clientY - this.cameraPointerY;
    this.cameraPointerX = event.clientX;
    this.cameraPointerY = event.clientY;
    this.callbacks.onCameraMove(deltaX, deltaY);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.cameraPointerId !== event.pointerId) return;
    const surface = this.surface;
    if (surface?.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
    this.endCameraPointer();
  };

  private endCameraPointer(): void {
    if (this.cameraPointerId === null) return;
    this.cameraPointerId = null;
    this.callbacks.onCameraEnd();
  }
}

export interface InputState {
  moveX: number;
  moveY: number;
  cameraX: number;
  cameraY: number;
  jumpPressed: boolean;
  punchPressed: boolean;
  groundPoundRequested: boolean;
}

export const EMPTY_INPUT_STATE: Readonly<InputState> = Object.freeze({
  moveX: 0,
  moveY: 0,
  cameraX: 0,
  cameraY: 0,
  jumpPressed: false,
  punchPressed: false,
  groundPoundRequested: false,
});

export function normalizeInputState(state: InputState): InputState {
  const length = Math.hypot(state.moveX, state.moveY);
  const scale = length > 1 ? 1 / length : 1;
  return {
    ...state,
    moveX: state.moveX * scale,
    moveY: state.moveY * scale,
  };
}

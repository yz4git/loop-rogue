import { VoxelType } from "../../world/VoxelDefinitions";
import { checkDigReachability } from "../Reachability";
import { setVoxel, type WorldGenerationContext, type WorldGenerationPass } from "../WorldGenerationPass";

export class ValidationPass implements WorldGenerationPass {
  readonly id = "validation";
  readonly progress = 100;

  run(context: WorldGenerationContext): void {
    let reachability = checkDigReachability(
      context.types,
      context.width,
      context.height,
      context.depth,
      context.spawn,
      context.goal,
    );
    if (!reachability.reachable) {
      // どのシードでも開始不能にせず、中央に限定した最後の補修を行う。
      for (let z = context.startZ; z <= context.goalZ; z += 1) {
        for (let y = 7; y <= 11; y += 1) {
          setVoxel(context, context.centerX, y, z, VoxelType.Empty);
        }
      }
      reachability = checkDigReachability(
        context.types,
        context.width,
        context.height,
        context.depth,
        context.spawn,
        context.goal,
      );
    }
    context.reachability = reachability;
  }
}

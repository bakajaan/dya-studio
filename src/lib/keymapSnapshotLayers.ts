/**
 * 実機から読み込んだ Keymap を、スナップショット保存用の形へ変換する。
 *
 * useKeymap 側にベタ書きすると巨大なフックがさらに膨らむので、純関数として
 * 切り出してテストできるようにしておく。
 */
import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { SnapshotLayer } from "./keymapSnapshots";

export function toSnapshotLayers(
  keymap: Keymap,
  behaviorName: (behaviorId: number) => string,
): SnapshotLayer[] {
  return keymap.layers.map((layer, layerIndex) => ({
    name: layer.name || `Layer ${layerIndex}`,
    bindings: layer.bindings.map((binding) => {
      const name = behaviorName(binding.behaviorId);
      const params = [binding.param1, binding.param2].filter(
        (value) => value !== 0,
      );
      return {
        behaviorId: binding.behaviorId,
        behaviorName: name,
        param1: binding.param1,
        param2: binding.param2,
        label: params.length > 0 ? `${name} ${params.join(" ")}` : name,
      };
    }),
  }));
}

export type PanelState = "loading" | "empty" | "error" | "success" | "partial";

type PanelStateArgs = {
  isLoading: boolean;
  hasError: boolean;
  itemCount: number;
  partialFailures?: number;
};

export function derivePanelState(args: PanelStateArgs): PanelState {
  if (args.isLoading) {
    return "loading";
  }

  if (args.hasError && args.itemCount === 0) {
    return "error";
  }

  if (args.partialFailures && args.partialFailures > 0 && args.itemCount > 0) {
    return "partial";
  }

  if (args.itemCount === 0) {
    return "empty";
  }

  return "success";
}

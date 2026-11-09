import { useRef, useState } from "react";
import type { FlashcardDeleteConsequences } from "@/types/view-models";

export type DeleteConsequencesState =
  | { status: "closed" }
  | { status: "loading"; targetId: string }
  | { status: "ready"; targetId: string; consequences: FlashcardDeleteConsequences }
  | { status: "unavailable"; targetId: string };

export function useDeleteConsequences() {
  const [state, setState] = useState<DeleteConsequencesState>({ status: "closed" });
  const requestToken = useRef(0);

  const open = (
    targetId: string,
    load?: (flashcardId: string) => Promise<FlashcardDeleteConsequences>,
  ) => {
    const token = ++requestToken.current;
    if (!load) {
      setState({ status: "unavailable", targetId });
      return;
    }
    setState({ status: "loading", targetId });
    load(targetId).then(
      (consequences) => {
        if (requestToken.current !== token) return;
        setState({ status: "ready", targetId, consequences });
      },
      () => {
        if (requestToken.current !== token) return;
        setState({ status: "unavailable", targetId });
      },
    );
  };

  const close = () => {
    requestToken.current += 1;
    setState({ status: "closed" });
  };

  return {
    targetId: state.status === "closed" ? null : state.targetId,
    isOpen: state.status !== "closed",
    consequences: state.status === "ready" ? state.consequences : null,
    unavailable: state.status === "unavailable",
    open,
    close,
  };
}

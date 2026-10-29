import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/toast";
import { armin } from "@/lib/armin-client";
import { notifySaveError } from "@/lib/notify";
import type { UiDeck } from "@/types/view-models";

/** Pin, rename, and delete, shared by a deck's dropdown and right-click menus. */
export function DeckActionItems({
  pinned,
  onTogglePin,
  onRename,
  onDelete,
  Item,
  Separator,
}: {
  pinned: boolean;
  onTogglePin: () => void;
  onRename: () => void;
  onDelete: () => void;
  Item: typeof DropdownMenuItem;
  Separator: typeof DropdownMenuSeparator;
}) {
  return (
    <>
      <Item onClick={onTogglePin}>
        {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
        {pinned ? "Unpin from sidebar" : "Pin to sidebar"}
      </Item>
      <Item onClick={onRename}>
        <Pencil className="h-4 w-4" />
        Rename deck
      </Item>
      <Separator />
      <Item variant="destructive" onClick={onDelete}>
        <Trash2 className="h-4 w-4" />
        Delete deck
      </Item>
    </>
  );
}

/**
 * The rename and delete dialogs for decks. Call `rename` or `remove` from a
 * menu and render `dialogs` once. `onDeleted` runs after a deck is removed.
 */
export function useDeckActions({ onDeleted }: { onDeleted?: (deck: UiDeck) => void } = {}) {
  const toast = useToast();
  const [renameOpen, setRenameOpen] = useState(false);
  const [renamingDeck, setRenamingDeck] = useState<UiDeck | null>(null);
  const [renameName, setRenameName] = useState("");
  const [closingAfterRename, setClosingAfterRename] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingDeck, setDeletingDeck] = useState<UiDeck | null>(null);
  const [closingAfterDelete, setClosingAfterDelete] = useState(false);

  const updateDeck = useMutation({
    mutationFn: (input: { id: string; version: number; name: string }) => armin.decks.update(input),
    onSuccess: (_result, deck) => {
      toast({ tone: "success", title: "Deck renamed", description: deck.name });
      setClosingAfterRename(true);
      setRenameOpen(false);
    },
    onError: (error) => notifySaveError(toast, "Couldn’t rename deck", error),
  });

  const deleteDeck = useMutation({
    mutationFn: (deck: UiDeck) => armin.decks.delete(deck.id),
    onSuccess: (_result, deck) => {
      toast({ tone: "success", title: "Deck deleted" });
      setClosingAfterDelete(true);
      setDeleteOpen(false);
      onDeleted?.(deck);
    },
    onError: () => {
      toast({ tone: "error", title: "Couldn’t delete deck" });
    },
  });

  const setPinned = useMutation({
    mutationFn: (input: { deck: UiDeck; pinned: boolean }) =>
      armin.decks.setPinned(input.deck.id, input.pinned),
    onError: (_error, { pinned }) => {
      toast({ tone: "error", title: pinned ? "Couldn’t pin deck" : "Couldn’t unpin deck" });
    },
  });

  const submitRename = () => {
    if (!renamingDeck || !renameName.trim()) return;
    updateDeck.mutate({
      id: renamingDeck.id,
      version: renamingDeck.version,
      name: renameName.trim(),
    });
  };

  const dialogs = (
    <>
      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        onExitComplete={() => {
          setRenamingDeck(null);
          setRenameName("");
          setClosingAfterRename(false);
        }}
        title="Rename deck"
        description="Choose a new name for this deck."
      >
        <div className="space-y-3">
          <Input
            placeholder="Deck name"
            value={renameName}
            autoFocus
            onChange={(e) => setRenameName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
            }}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!renameName.trim() || renameName.trim() === renamingDeck?.name}
              busy={updateDeck.isPending || closingAfterRename}
              onClick={submitRename}
            >
              Save
            </Button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onExitComplete={() => {
          setDeletingDeck(null);
          setClosingAfterDelete(false);
        }}
        title="Delete deck?"
        description={
          deletingDeck
            ? `“${deletingDeck.name}” and all ${deletingDeck.total} flashcards in it will be permanently removed.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            busy={deleteDeck.isPending || closingAfterDelete}
            onClick={() => {
              if (deletingDeck) deleteDeck.mutate(deletingDeck);
            }}
          >
            Delete deck
          </Button>
        </div>
      </Dialog>
    </>
  );

  return {
    togglePin: (deck: UiDeck) => setPinned.mutate({ deck, pinned: deck.pinnedAt == null }),
    rename: (deck: UiDeck) => {
      setRenamingDeck(deck);
      setRenameName(deck.name);
      setRenameOpen(true);
    },
    remove: (deck: UiDeck) => {
      setDeletingDeck(deck);
      setDeleteOpen(true);
    },
    dialogs,
  };
}

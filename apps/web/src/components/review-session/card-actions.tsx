import { Archive, EllipsisVertical, Flag, Info, Moon, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { MenuShortcut, ShortcutLabel } from "./parts";

export function CardActions({
  keymap,
  online,
  burying,
  actionPending,
  onInfo,
  onMenuOpenChange,
  onEdit,
  onBury,
  onFlagVariant,
  onArchive,
  onDelete,
}: {
  keymap: Record<string, string | undefined>;
  online: boolean;
  burying: boolean;
  actionPending: boolean;
  onInfo: () => void;
  onMenuOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onBury?: () => void;
  onFlagVariant?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Tooltip content={<ShortcutLabel label="Card info" binding={keymap["review.info"]} />}>
        <Button variant="ghost" size="icon-sm" aria-label="Card info" onClick={onInfo}>
          <Info className="h-4 w-4" />
        </Button>
      </Tooltip>
      <DropdownMenu onOpenChange={onMenuOpenChange}>
        <Tooltip content="Flashcard actions">
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="Flashcard actions" />}
          >
            <EllipsisVertical className="h-4 w-4" />
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-44">
          {onEdit && (
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="h-4 w-4" />
              Edit flashcard
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onInfo}>
            <Info className="h-4 w-4" />
            Card info
            <MenuShortcut binding={keymap["review.info"]} />
          </DropdownMenuItem>
          {onBury && (
            <DropdownMenuItem disabled={burying || !online} onClick={onBury}>
              <Moon className="h-4 w-4" />
              Bury until tomorrow
              <MenuShortcut binding={keymap["review.bury"]} />
            </DropdownMenuItem>
          )}
          {onFlagVariant && (
            <DropdownMenuItem disabled={actionPending || !online} onClick={onFlagVariant}>
              <Flag className="h-4 w-4" />
              Flag this exercise
            </DropdownMenuItem>
          )}
          {onArchive && (
            <DropdownMenuItem disabled={actionPending} onClick={onArchive}>
              <Archive className="h-4 w-4" />
              Archive
            </DropdownMenuItem>
          )}
          {onDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={actionPending} onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

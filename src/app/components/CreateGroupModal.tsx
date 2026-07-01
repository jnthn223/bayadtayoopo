import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Group, CurrentUser } from "./types";
import { generateId } from "./utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (group: Group) => void;
  currentUser: CurrentUser;
}

export function CreateGroupModal({
  open,
  onClose,
  onCreate,
  currentUser,
}: Props) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!name.trim()) {
      errs.name = "Group name is required";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleCreate() {
    if (!validate()) return;

    onCreate({
      id: generateId(),
      name: name.trim(),
      currency,
      members: [
        {
          id: currentUser.id,
          name: currentUser.name,
          color: currentUser.color,
        },
      ],
      expenses: [],
      createdAt: new Date().toISOString().slice(0, 10),
    });

    setName("");
    setCurrency("PHP");
    setErrors({});
    onClose();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm" />

        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="sticky top-0 bg-card pt-4 pb-3 px-5 flex items-center justify-between border-b border-border">
            <div className="w-10 h-1 bg-border rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-2" />

            <Dialog.Title className="text-lg font-semibold text-foreground">
              New Group
            </Dialog.Title>

            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-muted transition-colors"
            >
              <X size={18} className="text-muted-foreground" />
            </button>
          </div>

          <div className="p-5 space-y-5 pb-10">
            {/* Group name */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Group name
              </label>

              <input
                type="text"
                placeholder="e.g. Bali Trip 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
              />

              {errors.name && (
                <p className="text-destructive text-xs mt-1">{errors.name}</p>
              )}
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Currency
              </label>

              <div className="grid grid-cols-4 gap-2">
                {["PHP", "USD", "EUR", "GBP"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCurrency(c)}
                    className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${
                      currency === c
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-border bg-input-background text-muted-foreground"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {/* Creator */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Group creator
              </label>

              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white"
                  style={{ backgroundColor: currentUser.color }}
                >
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>

                <div>
                  <p className="font-medium text-foreground">
                    {currentUser.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {currentUser.email}
                  </p>
                </div>
              </div>

              <p className="mt-2 text-xs text-muted-foreground">
                You'll automatically be added as the first member. Invite others
                after creating the group.
              </p>
            </div>

            <button
              onClick={handleCreate}
              className="w-full py-4 rounded-2xl text-primary-foreground font-semibold text-base transition-all active:scale-95"
              style={{ backgroundColor: "var(--primary)" }}
            >
              Create Group
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Plus, Trash2 } from "lucide-react";
import type { Group, Member } from "./types";
import { generateId, MEMBER_COLORS } from "./utils";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (group: Group) => void;
}

export function CreateGroupModal({ open, onClose, onCreate }: Props) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("PHP");
  const [members, setMembers] = useState<Member[]>([
    { id: generateId(), name: "", color: MEMBER_COLORS[0] },
    { id: generateId(), name: "", color: MEMBER_COLORS[1] },
  ]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function addMember() {
    setMembers((prev) => [
      ...prev,
      {
        id: generateId(),
        name: "",
        color: MEMBER_COLORS[prev.length % MEMBER_COLORS.length],
      },
    ]);
  }

  function removeMember(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function updateMemberName(id: string, name: string) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, name } : m)));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Group name is required";
    const filledMembers = members.filter((m) => m.name.trim());
    if (filledMembers.length < 2) errs.members = "Add at least 2 members";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleCreate() {
    if (!validate()) return;
    const validMembers = members
      .filter((m) => m.name.trim())
      .map((m, i) => ({
        ...m,
        name: m.name.trim(),
        color: MEMBER_COLORS[i % MEMBER_COLORS.length],
      }));
    onCreate({
      id: generateId(),
      name: name.trim(),
      currency,
      members: validMembers,
      expenses: [],
      createdAt: new Date().toISOString().slice(0, 10),
    });
    setName("");
    setCurrency("USD");
    setMembers([
      { id: generateId(), name: "", color: MEMBER_COLORS[0] },
      { id: generateId(), name: "", color: MEMBER_COLORS[1] },
    ]);
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

            {/* Members */}
            <div>
              <label className="block text-sm text-muted-foreground mb-2">
                Members
              </label>
              <div className="space-y-2">
                {members.map((m, i) => (
                  <div key={m.id} className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm text-white font-medium shrink-0"
                      style={{
                        backgroundColor:
                          MEMBER_COLORS[i % MEMBER_COLORS.length],
                      }}
                    >
                      {m.name?.[0]?.toUpperCase() || i + 1}
                    </div>
                    <input
                      type="text"
                      placeholder={`Member ${i + 1}`}
                      value={m.name}
                      onChange={(e) => updateMemberName(m.id, e.target.value)}
                      className="flex-1 px-4 py-3 rounded-xl bg-input-background border border-border text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    {members.length > 2 && (
                      <button
                        onClick={() => removeMember(m.id)}
                        className="p-2 rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {errors.members && (
                <p className="text-destructive text-xs mt-1">
                  {errors.members}
                </p>
              )}
              <button
                onClick={addMember}
                className="mt-3 flex items-center gap-2 text-sm text-primary font-medium"
              >
                <Plus size={16} />
                Add member
              </button>
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

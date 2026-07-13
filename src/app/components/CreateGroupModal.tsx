import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Shuffle, Trash2, UserPlus, X } from "lucide-react";
import type { Group, CurrentUser, Member } from "./types";
import { generateId, MEMBER_COLORS } from "./utils";
import { UserAvatar } from "./UserAvatar";
import { GroupAvatar } from "./GroupAvatar";

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
  const [avatarSeed, setAvatarSeed] = useState(() => crypto.randomUUID());
  const [pendingName, setPendingName] = useState("");
  const [pendingMembers, setPendingMembers] = useState<Member[]>([]);
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
      avatarSeed,
      currency,
      adminId: currentUser.id,
      members: [
        {
          id: currentUser.id,
          name: currentUser.name,
          color: currentUser.color,
          avatarSeed: currentUser.avatarSeed,
        },
        ...pendingMembers,
      ],
      expenses: [],
      createdAt: new Date().toISOString().slice(0, 10),
    });

    setName("");
    setCurrency("PHP");
    setAvatarSeed(crypto.randomUUID());
    setPendingName("");
    setPendingMembers([]);
    setErrors({});
    onClose();
  }

  function addPendingMember() {
    const memberName = pendingName.trim();
    if (!memberName) return;
    const normalized = memberName.toLowerCase();
    if (
      normalized === currentUser.name.trim().toLowerCase() ||
      pendingMembers.some(
        (member) => member.name.trim().toLowerCase() === normalized,
      )
    ) {
      setErrors((value) => ({ ...value, pending: "That member is already listed" }));
      return;
    }
    setPendingMembers((members) => [
      ...members,
      {
        id: generateId(),
        name: memberName,
        color: MEMBER_COLORS[(members.length + 1) % MEMBER_COLORS.length],
        avatarSeed: crypto.randomUUID(),
        claimCode: crypto.randomUUID(),
      },
    ]);
    setPendingName("");
    setErrors((value) => ({ ...value, pending: "" }));
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
            <div className="flex flex-col items-center">
              <GroupAvatar
                name={name || "New group"}
                seed={avatarSeed}
                className="w-20 h-20 rounded-2xl shadow-md"
              />
              <button
                type="button"
                onClick={() => setAvatarSeed(crypto.randomUUID())}
                className="inline-flex items-center gap-2 mt-3 px-3 py-2 rounded-xl bg-accent text-accent-foreground text-xs font-semibold active:scale-95 transition-all"
              >
                <Shuffle size={14} />
                Randomize group image
              </button>
            </div>

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

            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Members joining later <span className="text-xs">(optional)</span>
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Add names now so you can include everyone in expenses immediately.
              </p>
              <div className="flex gap-2">
                <input
                  value={pendingName}
                  onChange={(event) => {
                    setPendingName(event.target.value);
                    setErrors((value) => ({ ...value, pending: "" }));
                  }}
                  onKeyDown={(event) => event.key === "Enter" && addPendingMember()}
                  placeholder="e.g. Nathan"
                  className="flex-1 min-w-0 px-4 py-3 rounded-xl bg-input-background border border-border text-sm outline-none focus:border-primary"
                />
                <button type="button" onClick={addPendingMember} className="px-4 rounded-xl bg-accent text-accent-foreground" title="Add member">
                  <UserPlus size={18} />
                </button>
              </div>
              {errors.pending && <p className="text-destructive text-xs mt-1">{errors.pending}</p>}
              {pendingMembers.length > 0 && (
                <div className="space-y-2 mt-3">
                  {pendingMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
                      <UserAvatar name={member.name} color={member.color} seed={member.avatarSeed} className="w-8 h-8 rounded-full" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{member.name}</p>
                        <p className="text-[11px] text-amber-700">Pending</p>
                      </div>
                      <button type="button" onClick={() => setPendingMembers((members) => members.filter((item) => item.id !== member.id))} className="p-2 rounded-lg text-destructive hover:bg-destructive/10">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Creator */}
            <div>
              <label className="block text-sm text-muted-foreground mb-1.5">
                Group creator
              </label>

              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-muted/30">
                <UserAvatar name={currentUser.name} color={currentUser.color} seed={currentUser.avatarSeed} className="w-10 h-10 rounded-full" />

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

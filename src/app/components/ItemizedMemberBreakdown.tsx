import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Expense } from "./types";
import { formatCurrency } from "./utils";
import { getItemizedMemberAmount } from "./itemizedExpense";

interface Props {
  expense: Expense;
  memberId: string;
  currency: string;
  defaultOpen?: boolean;
}

export function ItemizedMemberBreakdown({
  expense,
  memberId,
  currency,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);
  const items = (expense.items ?? []).filter((item) =>
    item.memberIds.includes(memberId),
  );

  if (expense.splitType !== "itemized" || items.length === 0) return null;

  const visibleItems = showAll ? items : items.slice(0, 3);

  return (
    <div className="mt-2 border-l-2 border-primary/15 pl-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary"
        aria-expanded={open}
      >
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open
          ? "Hide item breakdown"
          : `View ${items.length} ${items.length === 1 ? "item" : "items"}`}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          {visibleItems.map((item) => (
            <div
              key={item.id}
              className="flex items-start justify-between gap-3 text-[11px]"
            >
              <span className="min-w-0 truncate text-muted-foreground">
                {item.name}
                {item.memberIds.length > 1 ? " · shared" : ""}
              </span>
              <span className="shrink-0 font-medium text-foreground/80">
                {formatCurrency(
                  getItemizedMemberAmount(item, memberId),
                  currency,
                )}
              </span>
            </div>
          ))}

          {items.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAll((current) => !current)}
              className="inline-flex items-center gap-1 pt-0.5 text-[11px] font-semibold text-primary"
              aria-expanded={showAll}
            >
              <ChevronDown
                size={12}
                className={`transition-transform ${showAll ? "rotate-180" : ""}`}
              />
              {showAll
                ? "Show fewer items"
                : `View ${items.length - 3} more ${items.length - 3 === 1 ? "item" : "items"}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

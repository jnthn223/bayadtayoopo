import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { COMMON_CURRENCY_CODES, filterCurrencies, findCurrencyName } from "./currencies";
import { getCurrencySymbol } from "./utils";

interface Props {
  value: string;
  onChange: (value: string) => void;
  excludeCodes?: readonly string[];
  className?: string;
}

export function CurrencyPicker({ value, onChange, excludeCodes = [], className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = useMemo(() => filterCurrencies(query, excludeCodes), [query, excludeCodes]);
  const common = matches.filter(([code]) => COMMON_CURRENCY_CODES.some((commonCode) => commonCode === code));
  const selectedName = findCurrencyName(value);

  function choose(code: string) {
    onChange(code);
    setQuery("");
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery(""); }}>
      <Dialog.Trigger asChild>
        <button type="button" className={`flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-input-background px-4 py-3 text-left text-sm text-foreground outline-none transition-all hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 ${className}`}>
          <span className="min-w-0 truncate"><span className="font-semibold">{value}</span>{selectedName ? <span className="text-muted-foreground"> — {selectedName}</span> : null}</span>
          <ChevronDown size={17} className="shrink-0 text-muted-foreground" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[90] flex max-h-[82dvh] flex-col rounded-t-3xl border border-border bg-card shadow-2xl md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(92vw,34rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div><Dialog.Title className="text-lg font-semibold text-foreground">Choose currency</Dialog.Title><Dialog.Description className="text-xs text-muted-foreground">Search by currency code or name.</Dialog.Description></div>
            <Dialog.Close className="rounded-full bg-muted p-2.5 text-foreground hover:bg-border" aria-label="Close currency picker"><X size={19} /></Dialog.Close>
          </div>
          <div className="border-b border-border p-4">
            <div className="relative"><Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try PHP, dong, euro…" className="w-full rounded-xl border border-border bg-input-background py-3 pl-10 pr-4 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
          </div>
          <div className="overflow-y-auto px-3 py-3">
            {!query.trim() && common.length > 0 ? <CurrencySection title="Common currencies" currencies={common} value={value} onChoose={choose} /> : null}
            <CurrencySection title={query.trim() ? `${matches.length} result${matches.length === 1 ? "" : "s"}` : "All currencies"} currencies={matches} value={value} onChoose={choose} />
            {matches.length === 0 ? <p className="px-4 py-10 text-center text-sm text-muted-foreground">No currency matches “{query.trim()}”.</p> : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function CurrencySection({ title, currencies, value, onChoose }: { title: string; currencies: readonly (readonly [string, string])[]; value: string; onChoose: (code: string) => void }) {
  if (currencies.length === 0) return null;
  return <section className="mb-4 last:mb-0"><h3 className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3><div className="space-y-1">{currencies.map(([code, name]) => <button key={code} type="button" onClick={() => onChoose(code)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-muted"><span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{getCurrencySymbol(code)}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-foreground">{code}</span><span className="block truncate text-xs text-muted-foreground">{name}</span></span>{value === code ? <Check size={18} className="shrink-0 text-primary" /> : null}</button>)}</div></section>;
}

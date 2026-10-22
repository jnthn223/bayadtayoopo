import { EXPENSE_CATEGORIES } from "./types";
import type {
  Category,
  Expense,
  ExpenseItem,
  Group,
  Member,
  SplitType,
} from "./types";
import { generateId } from "./utils";
import { hasNonPayerShare, SELF_ONLY_EXPENSE_ERROR } from "./expenseValidation";
import { allocateItemizedShares, itemizedTotal } from "./itemizedExpense";

const HEADERS = [
  "date",
  "description",
  "category",
  "categoryDetail",
  "amount",
  "currency",
  "originalAmount",
  "originalCurrency",
  "conversionRate",
  "conversionRateDate",
  "conversionSource",
  "paidBy",
  "splitType",
  "splits",
  "items",
  "dueDate",
  "notes",
] as const;

const OPTIONAL_HEADERS = new Set<(typeof HEADERS)[number]>([
  "categoryDetail",
  "originalAmount",
  "originalCurrency",
  "conversionRate",
  "conversionRateDate",
  "conversionSource",
  "items",
  "dueDate",
  "notes",
]);
const REQUIRED_HEADERS = HEADERS.filter((header) => !OPTIONAL_HEADERS.has(header));

type CsvRow = Record<string, string>;

export type ExpenseImportResult =
  | { ok: true; expenses: Expense[] }
  | { ok: false; errors: string[] };

export function exportExpensesTemplateCsv(group: Group): string {
  const members = group.members.slice(0, Math.max(1, group.members.length));
  const payer = members[0];
  const equalAmount = members.length * 300;
  const customAmount = members.length * 500;
  const rows: string[][] = [
    [...HEADERS],
    [
      new Date().toISOString().slice(0, 10),
      "Sample dinner",
      "food",
      "",
      String(equalAmount),
      group.currency,
      "",
      "",
      "",
      "",
      "",
      payer?.name ?? "Member name",
      "equal",
      members.map((member) => `${member.name}:300`).join(";"),
      "",
      "",
      "",
    ],
    [
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      "Sample hotel",
      "accommodation",
      "",
      String(customAmount),
      group.currency,
      "",
      "",
      "",
      "",
      "",
      payer?.name ?? "Member name",
      "custom",
      members.map((member) => `${member.name}:500`).join(";"),
      "",
      "",
      "",
    ],
  ];

  if (members.length >= 2) {
    const itemizedItems = [
      { name: "Main dish", amount: 300, members: [members[0].name] },
      {
        name: "Shared drinks",
        amount: 200,
        members: [members[0].name, members[1].name],
      },
    ];
    rows.push([
      new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      "Sample itemized meal",
      "food",
      "",
      "500",
      group.currency,
      "",
      "",
      "",
      "",
      "",
      payer?.name ?? "Member name",
      "itemized",
      `${members[0].name}:400;${members[1].name}:100`,
      JSON.stringify(itemizedItems),
      "",
      "Items use JSON with name, amount, and members",
    ]);
  }

  return stringifyCsv(rows);
}

export function exportExpensesCsv(group: Group): string {
  return stringifyCsv([
    [...HEADERS],
    ...group.expenses.map((expense) => expenseToRow(expense, group)),
  ]);
}

export function parseExpensesCsv(
  csv: string,
  group: Group,
  createdBy: string,
): ExpenseImportResult {
  const rows = parseCsv(csv);
  const errors: string[] = [];
  const existingFingerprints = new Set(
    group.expenses.map((expense) => expenseFingerprint(expense)),
  );
  const importedFingerprints = new Set<string>();
  if (rows.length < 2) {
    return { ok: false, errors: ["CSV must include a header row and at least one expense row"] };
  }

  const headers = rows[0].map((header) => header.trim());
  const missingHeaders = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missingHeaders.length) {
    return {
      ok: false,
      errors: [`Missing required column(s): ${missingHeaders.join(", ")}`],
    };
  }

  const expenses = rows
    .slice(1)
    .map((row, index) => ({ row, lineNumber: index + 2 }))
    .filter(({ row }) => row.some((cell) => cell.trim()))
    .map(({ row, lineNumber }) => {
      const record = Object.fromEntries(
        headers.map((header, cellIndex) => [header, row[cellIndex]?.trim() ?? ""]),
      ) as CsvRow;

      const parsed = parseExpenseRow(record, group, createdBy, lineNumber);
      if (!parsed.ok) {
        errors.push(...parsed.errors);
        return null;
      }

      const fingerprint = expenseFingerprint(parsed.expense);
      if (existingFingerprints.has(fingerprint)) {
        errors.push(
          `Row ${lineNumber}: duplicate expense already exists in this group`,
        );
        return null;
      }
      if (importedFingerprints.has(fingerprint)) {
        errors.push(`Row ${lineNumber}: duplicate expense in this CSV file`);
        return null;
      }

      importedFingerprints.add(fingerprint);
      return parsed.expense;
    })
    .filter((expense): expense is Expense => Boolean(expense));

  if (!expenses.length && !errors.length) {
    errors.push("CSV must include at least one expense row");
  }

  return errors.length ? { ok: false, errors } : { ok: true, expenses };
}

function expenseToRow(expense: Expense, group: Group): string[] {
  const historicalMembers = [...group.members, ...(group.formerMembers ?? [])];
  const paidBy = getMemberName(historicalMembers, expense.paidBy);
  return [
    expense.date,
    expense.description,
    expense.category,
    expense.categoryDetail ?? "",
    String(expense.amount),
    group.currency,
    expense.originalAmount !== undefined ? String(expense.originalAmount) : "",
    expense.originalCurrency ?? "",
    expense.conversionRate !== undefined ? String(expense.conversionRate) : "",
    expense.conversionRateDate ?? "",
    expense.conversionSource ?? "",
    paidBy,
    expense.splitType,
    expense.splits
      .map((split) => `${getMemberName(historicalMembers, split.memberId)}:${split.amount}`)
      .join(";"),
    expense.items?.length
      ? JSON.stringify(
          expense.items.map((item) => ({
            name: item.name,
            amount: item.amount,
            members: item.memberIds.map((memberId) =>
              getMemberName(historicalMembers, memberId),
            ),
          })),
        )
      : "",
    expense.dueDate ?? "",
    expense.notes ?? "",
  ];
}

function parseExpenseRow(
  row: CsvRow,
  group: Group,
  createdBy: string,
  lineNumber: number,
): { ok: true; expense: Expense } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const amount = Number(row.amount);
  const category = row.category.toLowerCase() as Category;
  const splitType = row.splitType.toLowerCase() as SplitType;
  const paidBy = findMemberByName(group.members, row.paidBy, createdBy);
  const originalAmount = row.originalAmount ? Number(row.originalAmount) : undefined;
  const conversionRate = row.conversionRate ? Number(row.conversionRate) : undefined;
  const conversionSource = row.conversionSource || undefined;

  if (!isValidDate(row.date)) errors.push(`Row ${lineNumber}: date must be YYYY-MM-DD`);
  if (!row.description) errors.push(`Row ${lineNumber}: description is required`);
  if (!Number.isFinite(amount) || amount <= 0) {
    errors.push(`Row ${lineNumber}: amount must be greater than zero`);
  }
  if (row.currency && row.currency !== group.currency) {
    errors.push(`Row ${lineNumber}: currency must be ${group.currency}`);
  }
  if (!EXPENSE_CATEGORIES.includes(category)) {
    errors.push(
      `Row ${lineNumber}: category must be one of ${EXPENSE_CATEGORIES.join(", ")}`,
    );
  }
  if (category === "other" && !row.categoryDetail) {
    errors.push(`Row ${lineNumber}: categoryDetail is required when category is other`);
  }
  if (row.categoryDetail && row.categoryDetail.length > 50) {
    errors.push(`Row ${lineNumber}: categoryDetail must be 50 characters or fewer`);
  }
  if (splitType !== "equal" && splitType !== "custom" && splitType !== "itemized") {
    errors.push(`Row ${lineNumber}: splitType must be equal, custom, or itemized`);
  }
  if (!paidBy) {
    errors.push(`Row ${lineNumber}: paidBy "${row.paidBy}" is not a group member`);
  }

  const splits = parseSplits(row.splits, group, createdBy, lineNumber);
  if (!splits.ok) errors.push(...splits.errors);
  const items = parseItems(row.items, group, createdBy, splitType, lineNumber);
  if (!items.ok) errors.push(...items.errors);

  if (row.dueDate) {
    if (!isValidDate(row.dueDate)) {
      errors.push(`Row ${lineNumber}: dueDate must be YYYY-MM-DD`);
    } else if (isValidDate(row.date) && row.dueDate < row.date) {
      errors.push(`Row ${lineNumber}: dueDate cannot be earlier than date`);
    }
  }

  const hasForeignCurrencyData = Boolean(
    row.originalAmount ||
      row.originalCurrency ||
      row.conversionRate ||
      row.conversionRateDate ||
      row.conversionSource,
  );
  if (hasForeignCurrencyData) {
    if (!Number.isFinite(originalAmount) || (originalAmount ?? 0) <= 0) {
      errors.push(`Row ${lineNumber}: originalAmount must be greater than zero`);
    }
    if (!row.originalCurrency) {
      errors.push(`Row ${lineNumber}: originalCurrency is required when conversion details are provided`);
    }
    if (!Number.isFinite(conversionRate) || (conversionRate ?? 0) <= 0) {
      errors.push(`Row ${lineNumber}: conversionRate must be greater than zero`);
    }
    if (row.conversionRateDate && !isValidDate(row.conversionRateDate)) {
      errors.push(`Row ${lineNumber}: conversionRateDate must be YYYY-MM-DD`);
    }
    if (
      conversionSource &&
      conversionSource !== "online-suggestion" &&
      conversionSource !== "manual"
    ) {
      errors.push(
        `Row ${lineNumber}: conversionSource must be online-suggestion or manual`,
      );
    }
    if (
      Number.isFinite(amount) &&
      Number.isFinite(originalAmount) &&
      Number.isFinite(conversionRate) &&
      Math.abs(roundMoney((originalAmount ?? 0) * (conversionRate ?? 0)) - roundMoney(amount)) > 0.01
    ) {
      errors.push(
        `Row ${lineNumber}: originalAmount × conversionRate must match amount`,
      );
    }
  }

  if (splits.ok && Number.isFinite(amount)) {
    const splitTotal = roundMoney(
      splits.splits.reduce((sum, split) => sum + split.amount, 0),
    );
    if (Math.abs(splitTotal - roundMoney(amount)) > 0.01) {
      errors.push(
        `Row ${lineNumber}: split total ${splitTotal.toFixed(2)} does not match amount ${amount.toFixed(2)}`,
      );
    }
    if (paidBy && !hasNonPayerShare(paidBy.id, splits.splits)) {
      errors.push(`Row ${lineNumber}: ${SELF_ONLY_EXPENSE_ERROR}`);
    }
  }

  if (items.ok && items.items && Number.isFinite(amount)) {
    const itemsTotal = itemizedTotal(items.items);
    if (Math.abs(itemsTotal - roundMoney(amount)) > 0.01) {
      errors.push(
        `Row ${lineNumber}: item total ${itemsTotal.toFixed(2)} does not match amount ${amount.toFixed(2)}`,
      );
    }
    if (splits.ok) {
      const allocated = allocateItemizedShares(items.items);
      const splitAmounts = Object.fromEntries(
        splits.splits.map((split) => [split.memberId, roundMoney(split.amount)]),
      );
      const memberIds = new Set([...Object.keys(allocated), ...Object.keys(splitAmounts)]);
      if (
        [...memberIds].some(
          (memberId) =>
            Math.abs((allocated[memberId] ?? 0) - (splitAmounts[memberId] ?? 0)) > 0.01,
        )
      ) {
        errors.push(`Row ${lineNumber}: item assignments must match splits`);
      }
    }
  }

  if (errors.length || !paidBy || !splits.ok || !items.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    expense: {
      id: generateId(),
      description: row.description,
      notes: row.notes || undefined,
      amount: roundMoney(amount),
      originalAmount: hasForeignCurrencyData ? roundMoney(originalAmount!) : undefined,
      originalCurrency: hasForeignCurrencyData ? row.originalCurrency : undefined,
      conversionRate: hasForeignCurrencyData ? conversionRate : undefined,
      conversionRateDate: hasForeignCurrencyData
        ? row.conversionRateDate || row.date
        : undefined,
      conversionSource: hasForeignCurrencyData
        ? (conversionSource as Expense["conversionSource"] | undefined) ?? "manual"
        : undefined,
      paidBy: paidBy.id,
      createdBy,
      splitType,
      splits: splits.splits,
      items: items.items,
      date: row.date,
      dueDate: row.dueDate || undefined,
      category,
      categoryDetail: category === "other" ? row.categoryDetail || undefined : undefined,
      createdAt: new Date().toISOString(),
    },
  };
}

function parseItems(
  value: string,
  group: Group,
  currentMemberId: string,
  splitType: SplitType,
  lineNumber: number,
):
  | { ok: true; items: ExpenseItem[] | undefined }
  | { ok: false; errors: string[] } {
  if (splitType !== "itemized") {
    return value
      ? {
          ok: false,
          errors: [`Row ${lineNumber}: items can only be used with splitType itemized`],
        }
      : { ok: true, items: undefined };
  }
  if (!value) {
    return {
      ok: false,
      errors: [`Row ${lineNumber}: items are required when splitType is itemized`],
    };
  }

  let rawItems: unknown;
  try {
    rawItems = JSON.parse(value);
  } catch {
    return {
      ok: false,
      errors: [`Row ${lineNumber}: items must be valid JSON`],
    };
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return {
      ok: false,
      errors: [`Row ${lineNumber}: items must be a non-empty JSON array`],
    };
  }

  const errors: string[] = [];
  const items = rawItems.map((rawItem, itemIndex) => {
    const itemNumber = itemIndex + 1;
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      errors.push(`Row ${lineNumber}: item ${itemNumber} must be an object`);
      return null;
    }

    const record = rawItem as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const amount = typeof record.amount === "number"
      ? record.amount
      : Number(record.amount);
    const memberNames = Array.isArray(record.members) ? record.members : [];

    if (!name) errors.push(`Row ${lineNumber}: item ${itemNumber} name is required`);
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push(`Row ${lineNumber}: item ${itemNumber} amount must be greater than zero`);
    }
    if (memberNames.length === 0) {
      errors.push(`Row ${lineNumber}: item ${itemNumber} must include at least one member`);
    }

    const seen = new Set<string>();
    const memberIds = memberNames.flatMap((rawName) => {
      if (typeof rawName !== "string") {
        errors.push(`Row ${lineNumber}: item ${itemNumber} member names must be text`);
        return [];
      }
      const member = findMemberByName(group.members, rawName, currentMemberId);
      if (!member) {
        errors.push(
          `Row ${lineNumber}: item ${itemNumber} member "${rawName}" is not a group member`,
        );
        return [];
      }
      if (seen.has(member.id)) return [];
      seen.add(member.id);
      return [member.id];
    });

    if (!name || !Number.isFinite(amount) || amount <= 0 || memberIds.length === 0) {
      return null;
    }
    return {
      id: generateId(),
      name,
      amount: roundMoney(amount),
      memberIds,
    } satisfies ExpenseItem;
  }).filter((item): item is ExpenseItem => Boolean(item));

  return errors.length ? { ok: false, errors } : { ok: true, items };
}

function parseSplits(
  value: string,
  group: Group,
  currentMemberId: string,
  lineNumber: number,
): { ok: true; splits: Expense["splits"] } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const seen = new Set<string>();
  const splits = value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.lastIndexOf(":");
      if (separator <= 0) {
        errors.push(`Row ${lineNumber}: split "${part}" must use member:amount`);
        return null;
      }

      const memberName = part.slice(0, separator).trim();
      const amount = Number(part.slice(separator + 1).trim());
      const member = findMemberByName(group.members, memberName, currentMemberId);

      if (!member) {
        errors.push(`Row ${lineNumber}: split member "${memberName}" is not a group member`);
        return null;
      }
      if (seen.has(member.id)) {
        errors.push(`Row ${lineNumber}: split member "${memberName}" appears more than once`);
        return null;
      }
      if (!Number.isFinite(amount) || amount < 0) {
        errors.push(`Row ${lineNumber}: split amount for "${memberName}" must be zero or greater`);
        return null;
      }

      seen.add(member.id);
      return { memberId: member.id, amount: roundMoney(amount) };
    })
    .filter((split): split is Expense["splits"][number] => Boolean(split));

  if (!splits.length) errors.push(`Row ${lineNumber}: splits are required`);
  return errors.length ? { ok: false, errors } : { ok: true, splits };
}

function stringifyCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
}

function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    const next = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function findMemberByName(
  members: Member[],
  name: string,
  currentMemberId?: string,
): Member | undefined {
  const normalized = name.trim().toLowerCase();
  if (normalized === "you" && currentMemberId) {
    return members.find(
      (member) => member.id === currentMemberId || member.uid === currentMemberId,
    );
  }

  return members.find((member) => member.name.trim().toLowerCase() === normalized);
}

function getMemberName(members: Member[], memberId: string): string {
  return members.find((member) => member.id === memberId)?.name ?? memberId;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function expenseFingerprint(expense: Expense): string {
  const splits = [...expense.splits]
    .map((split) => `${split.memberId}:${roundMoney(split.amount).toFixed(2)}`)
    .sort()
    .join("|");

  return [
    expense.date,
    expense.description.trim().toLowerCase(),
    expense.category,
    roundMoney(expense.amount).toFixed(2),
    expense.paidBy,
    expense.splitType,
    splits,
  ].join("::");
}

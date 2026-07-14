import { EXPENSE_CATEGORIES } from "./types";
import type { Category, Expense, Group, Member, SplitType } from "./types";
import { generateId } from "./utils";

const HEADERS = [
  "date",
  "description",
  "category",
  "amount",
  "currency",
  "paidBy",
  "splitType",
  "splits",
] as const;

type CsvRow = Record<(typeof HEADERS)[number], string>;

export type ExpenseImportResult =
  | { ok: true; expenses: Expense[] }
  | { ok: false; errors: string[] };

export function exportExpensesTemplateCsv(group: Group): string {
  const members = group.members.slice(0, Math.max(1, group.members.length));
  const payer = members[0];
  const equalAmount = members.length * 300;
  const customAmount = members.length * 500;

  return stringifyCsv([
    [...HEADERS],
    [
      new Date().toISOString().slice(0, 10),
      "Sample dinner",
      "food",
      String(equalAmount),
      group.currency,
      payer?.name ?? "Member name",
      "equal",
      members.map((member) => `${member.name}:300`).join(";"),
    ],
    [
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      "Sample hotel",
      "accommodation",
      String(customAmount),
      group.currency,
      payer?.name ?? "Member name",
      "custom",
      members.map((member) => `${member.name}:500`).join(";"),
    ],
  ]);
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
  const missingHeaders = HEADERS.filter((header) => !headers.includes(header));
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
    String(expense.amount),
    group.currency,
    paidBy,
    expense.splitType,
    expense.splits
      .map((split) => `${getMemberName(historicalMembers, split.memberId)}:${split.amount}`)
      .join(";"),
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
  if (splitType !== "equal" && splitType !== "custom") {
    errors.push(`Row ${lineNumber}: splitType must be equal or custom`);
  }
  if (!paidBy) {
    errors.push(`Row ${lineNumber}: paidBy "${row.paidBy}" is not a group member`);
  }

  const splits = parseSplits(row.splits, group, createdBy, lineNumber);
  if (!splits.ok) errors.push(...splits.errors);

  if (splits.ok && Number.isFinite(amount)) {
    const splitTotal = roundMoney(
      splits.splits.reduce((sum, split) => sum + split.amount, 0),
    );
    if (Math.abs(splitTotal - roundMoney(amount)) > 0.01) {
      errors.push(
        `Row ${lineNumber}: split total ${splitTotal.toFixed(2)} does not match amount ${amount.toFixed(2)}`,
      );
    }
  }

  if (errors.length || !paidBy || !splits.ok) return { ok: false, errors };

  return {
    ok: true,
    expense: {
      id: generateId(),
      description: row.description,
      amount: roundMoney(amount),
      paidBy: paidBy.id,
      createdBy,
      splitType,
      splits: splits.splits,
      date: row.date,
      category,
    },
  };
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

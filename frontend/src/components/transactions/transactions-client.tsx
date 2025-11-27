"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import * as XLSX from "xlsx";
import Header from "@/components/dashboard/header";
import { CATEGORY_VALUES } from "@/lib/categories";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { CalendarIcon, Trash2, Plus, Upload } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import {
  useSpendingData,
  type TransactionInputRow,
} from "@/lib/spending-store";
import type { MonthlySpending } from "@/lib/data";
import PersistenceBanner from "@/components/persistence-banner";

type TransactionRow = {
  id: number;
  date: string;
  merchant: string;
  type: string;
  amount: number;
};

type ImportMapping = {
  date: string;
  merchant: string;
  description: string;
  amount: string;
};

async function categorizeDescriptions(
  descriptions: string[]
): Promise<string[]> {
  if (descriptions.length === 0) return [];
  try {
    const res = await fetch("/api/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts: descriptions }),
    });

    if (!res.ok) {
      console.error("Categorization API error", await res.text());
      return descriptions.map(() => "");
    }

    const data = await res.json();
    return (data.categories as string[]) ?? descriptions.map(() => "");
  } catch (err) {
    console.error("Categorization network error", err);
    return descriptions.map(() => "");
  }
}

function toLocalISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeImportedDate(dateRaw: any): string {
  if (dateRaw == null || dateRaw === "") return "";

  if (typeof dateRaw === "number" && !isNaN(dateRaw)) {
    const parsed = XLSX.SSF.parse_date_code(dateRaw);
    if (!parsed) return "";
    const year = parsed.y.toString().padStart(4, "0");
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (dateRaw instanceof Date) {
    if (isNaN(dateRaw.getTime())) return "";
    return toLocalISODate(dateRaw);
  }

  if (typeof dateRaw === "string") {
    const trimmed = dateRaw.trim();

    const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(trimmed);
    if (m) {
      let p1 = parseInt(m[1], 10);
      let p2 = parseInt(m[2], 10);
      let year = parseInt(m[3].length === 2 ? `20${m[3]}` : m[3], 10);

      let day: number;
      let month: number;


      if (p1 > 12 && p2 <= 12) {
        day = p1;
        month = p2;
      } else if (p2 > 12 && p1 <= 12) {
        month = p1;
        day = p2;
      } else {
        day = p1;
        month = p2;
      }

      const d = new Date(year, month - 1, day);
      if (!isNaN(d.getTime())) {
        return toLocalISODate(d);
      }
    }

    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
    if (iso) {
      return `${iso[1]}-${iso[2]}-${iso[3]}`;
    }

    const d2 = new Date(trimmed);
    if (!isNaN(d2.getTime())) {
      return toLocalISODate(d2);
    }

    return trimmed;
  }

  return String(dateRaw);
}

function rebuildRowsFromSpending(months: MonthlySpending[]): TransactionRow[] {
  const rows: TransactionRow[] = [];
  let nextId = 1;

  for (const m of months) {
    const monthIndex = new Date(`${m.month} 1, ${m.year}`).getMonth();

    for (const day of m.dailySpending) {
      const dayNum = parseInt(day.day, 10);
      if (isNaN(dayNum)) continue;

      const date = new Date(m.year, monthIndex, dayNum);
      const isoDate = toLocalISODate(date);

      const expenses = day.expenses ?? [];
      for (const exp of expenses) {
        rows.push({
          id: nextId++,
          date: isoDate,
          merchant: exp.merchant,
          type: exp.category ?? "",
          amount: exp.value,
        });
      }
    }
  }

  return rows;
}


function normalizeDate(d: string): string {
  return d.trim().slice(0, 10);
}

function normalizeMerchant(m: string): string {
  return m.trim().toLowerCase().replace(/\s+/g, " ");
}

function amountsEqual(a: number, b: number): boolean {
  return Math.abs(Number(a) - Number(b)) < 0.0001;
}

function duplicateKey(row: TransactionRow): string {
  return [
    normalizeDate(row.date) || "nodate",
    normalizeMerchant(row.merchant) || "nomerchant",
    Number.isFinite(row.amount) ? row.amount.toFixed(2) : "0.00",
  ].join("|");
}

export default function TransactionsClient() {
  const {
    spendingData,
    availableMonths,
    availableYears,
    setMonthFromRows,
  } = useSpendingData();

  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<string>(
    now.toLocaleString("en-US", { month: "long" })
  );

  const [allRows, setAllRows] = useState<TransactionRow[]>([]);
  const [hydratedFromStore, setHydratedFromStore] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newDate, setNewDate] = useState<Date | undefined>();
  const [newMerchant, setNewMerchant] = useState("");
  const [newType, setNewType] = useState("");
  const [newAmount, setNewAmount] = useState("");

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importData, setImportData] = useState<any[] | null>(null);
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ImportMapping>({
    date: "",
    merchant: "",
    description: "",
    amount: "",
  });
  const [isImporting, setIsImporting] = useState(false);

  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [pendingImportRows, setPendingImportRows] = useState<
    TransactionRow[] | null
  >(null);
  const [pendingUniqueRows, setPendingUniqueRows] = useState<
    TransactionRow[] | null
  >(null);
  const [pendingDuplicateCount, setPendingDuplicateCount] = useState(0);

  useEffect(() => {
    if (hydratedFromStore) return;

    if (!spendingData || spendingData.length === 0) {
      setHydratedFromStore(true);
      return;
    }

    const restored = rebuildRowsFromSpending(spendingData);
    setAllRows(restored);
    setHydratedFromStore(true);
  }, [hydratedFromStore, spendingData]);

  const rows = useMemo(() => {
    const filtered = allRows.filter(row => {
      if (!row.date) return false;
      const d = new Date(row.date);
      if (isNaN(d.getTime())) return false;
      const rowYear = d.getFullYear();
      const rowMonthName = d.toLocaleString("en-US", { month: "long" });
      return rowYear === year && rowMonthName === month;
    });

    return [...filtered].sort((a, b) => {
      const da = new Date(a.date).getTime();
      const db = new Date(b.date).getTime();
      if (da !== db) return db - da;

      const ma = a.merchant.toLowerCase();
      const mb = b.merchant.toLowerCase();
      if (ma < mb) return -1;
      if (ma > mb) return 1;

      if (a.amount !== b.amount) return a.amount - b.amount;

      return a.id - b.id;
    });
  }, [allRows, year, month]);


  useEffect(() => {
    if (!hydratedFromStore) return;

    const payload: TransactionInputRow[] = allRows.map(r => ({
      date: r.date,
      merchant: r.merchant,
      category: r.type,
      amount: r.amount,
    }));

    setMonthFromRows(year, month, payload);
  }, [allRows, year, month, setMonthFromRows, hydratedFromStore]);

  const allTypes = CATEGORY_VALUES;

  const handleTypeChange = (id: number, type: string) => {
    setAllRows(prev =>
      prev.map(row => (row.id === id ? { ...row, type } : row))
    );
  };

  const handleAmountChange = (id: number, amount: string) => {
    const parsed = parseFloat(amount);
    setAllRows(prev =>
      prev.map(row =>
        row.id === id ? { ...row, amount: isNaN(parsed) ? 0 : parsed } : row
      )
    );
  };

  const handleDelete = (id: number) => {
    setAllRows(prev => prev.filter(row => row.id !== id));
  };

  const handleAdd = () => {
    const parsedAmount = parseFloat(newAmount);
    if (!newDate || !newMerchant || isNaN(parsedAmount)) {
      return;
    }

    const isoDate = toLocalISODate(newDate);

    setAllRows(prev => {
      const maxId = prev.reduce((max, r) => Math.max(max, r.id), 0);
      return [
        ...prev,
        {
          id: maxId + 1,
          date: isoDate,
          merchant: newMerchant,
          type: newType || "",
          amount: parsedAmount,
        },
      ];
    });

    setNewDate(undefined);
    setNewMerchant("");
    setNewType("");
    setNewAmount("");
    setIsAddOpen(false);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = evt => {
      const data = evt.target?.result;
      if (!data) return;

      const workbook = XLSX.read(data, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, {
        defval: "",
        raw: false,
      }) as any[];

      if (!json || json.length === 0) {
        setImportData(null);
        setImportColumns([]);
        return;
      }

      const columns = Object.keys(json[0]);
      setImportData(json);
      setImportColumns(columns);

      const lowerCols = columns.map(c => c.toLowerCase());
      const dateIdx =
        lowerCols.findIndex(
          c => c.includes("date") || c.includes("ημερομηνία")
        ) ?? -1;
      const merchantIdx =
        lowerCols.findIndex(
          c =>
            c.includes("merchant") ||
            c.includes("αντισυμβαλλόμεν") ||
            c.includes("description")
        ) ?? -1;
      const amountIdx =
        lowerCols.findIndex(c => c.includes("amount") || c.includes("ποσό")) ??
        -1;

      setMapping({
        date: columns[dateIdx >= 0 ? dateIdx : 0],
        merchant: columns[merchantIdx >= 0 ? merchantIdx : 0],
        description: columns[merchantIdx >= 0 ? merchantIdx : 0],
        amount: columns[amountIdx >= 0 ? amountIdx : 0],
      });
    };

    reader.readAsArrayBuffer(file);
  };

  const handleImportExpenses = async () => {
    if (!importData) return;
    if (!mapping.date || !mapping.merchant || !mapping.amount) return;

    setIsImporting(true);
    try {
      const importedRows: TransactionRow[] = [];

      const existingMerchantCategory = new Map<string, string>();
      for (const r of allRows) {
        if (!r.type) continue; 
        const norm = normalizeMerchant(r.merchant);
        if (!existingMerchantCategory.has(norm)) {
          existingMerchantCategory.set(norm, r.type);
        }
      }

      const descriptionsToPredict: string[] = [];
      const rowsNeedingPrediction: number[] = [];

      let nextId = allRows.reduce((max, r) => Math.max(max, r.id), 0) || 0;

      for (const record of importData) {
        const dateRaw = record[mapping.date];
        const merchantRaw = record[mapping.merchant];
        const descRaw = mapping.description
          ? record[mapping.description]
          : merchantRaw;
        const amountRaw = record[mapping.amount];

        const merchant = String(merchantRaw ?? "").trim();
        const description = String(descRaw ?? "").trim();
        const amount = parseFloat(String(amountRaw).replace(",", "."));

        if (!merchant || isNaN(amount)) {
          continue;
        }

        const isoDate = normalizeImportedDate(dateRaw);

        const normMerchant = normalizeMerchant(merchant);
        const knownCategory = existingMerchantCategory.get(normMerchant) ?? "";

        nextId += 1;
        const rowIndex = importedRows.length;

        importedRows.push({
          id: nextId,
          date: isoDate,
          merchant,
          type: knownCategory,
          amount,
        });

        if (!knownCategory) {
          descriptionsToPredict.push(description || merchant);
          rowsNeedingPrediction.push(rowIndex);
        }
      }

      if (descriptionsToPredict.length > 0) {
        const predicted = await categorizeDescriptions(descriptionsToPredict);

        rowsNeedingPrediction.forEach((rowIdx, i) => {
          const cat = predicted[i] ?? "";
          importedRows[rowIdx].type = cat;
        });
      }

      const existingKeys = new Set(allRows.map(r => duplicateKey(r)));

      const duplicates: TransactionRow[] = [];
      const uniques: TransactionRow[] = [];

      for (const imp of importedRows) {
        const key = duplicateKey(imp);
        if (existingKeys.has(key)) {
          duplicates.push(imp);
        } else {
          uniques.push(imp);
        }
      }

      if (duplicates.length === 0) {
        setAllRows(prev => [...prev, ...importedRows]);
        setIsImportOpen(false);
      } else {
        setPendingImportRows(importedRows);
        setPendingUniqueRows(uniques);
        setPendingDuplicateCount(duplicates.length);
        setDuplicateDialogOpen(true);
      }
    } finally {
      setIsImporting(false);
    }
  };

  const handleDuplicatesAddAll = () => {
    if (!pendingImportRows) {
      setDuplicateDialogOpen(false);
      return;
    }

    setAllRows(prev => [...prev, ...pendingImportRows]);
    setPendingImportRows(null);
    setPendingUniqueRows(null);
    setPendingDuplicateCount(0);
    setDuplicateDialogOpen(false);
    setIsImportOpen(false);
  };

  const handleDuplicatesSkip = () => {
    if (!pendingUniqueRows) {
      setPendingImportRows(null);
      setPendingUniqueRows(null);
      setPendingDuplicateCount(0);
      setDuplicateDialogOpen(false);
      setIsImportOpen(false);
      return;
    }

    if (pendingUniqueRows.length > 0) {
      setAllRows(prev => [...prev, ...pendingUniqueRows]);
    }

    setPendingImportRows(null);
    setPendingUniqueRows(null);
    setPendingDuplicateCount(0);
    setDuplicateDialogOpen(false);
    setIsImportOpen(false);
  };

  const handleDuplicatesCancel = () => {
    setPendingImportRows(null);
    setPendingUniqueRows(null);
    setPendingDuplicateCount(0);
    setDuplicateDialogOpen(false);
  };

  return (
    <div className="flex min-h-screen w-full flex-col">
      <Header />
      <main className="flex flex-1 flex-col gap-4 p-4 sm:p-6 md:gap-8 md:p-8">
        {/* HEADER */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
            <p className="text-sm text-muted-foreground">
              View and manage your expenses for each month.
            </p>
          </div>

          <div className="flex items-center gap-2 md:ml-auto">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[140px] bg-background">
                <SelectValue placeholder="Select Month" />
              </SelectTrigger>
              <SelectContent>
                {availableMonths.map(m => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(year)}
              onValueChange={v => setYear(Number(v))}
            >
              <SelectTrigger className="w-[120px] bg-background">
                <SelectValue placeholder="Select Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(y => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* TABLE CARD */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-lg font-semibold">
              Expenses for {month} {year}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* Import from Excel */}
              <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Upload className="h-4 w-4" />
                    Import
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import expenses from Excel</DialogTitle>
                    <DialogDescription>
                      Upload an Excel file and map its columns to the fields
                      below. Categories will be automatically predicted.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="mt-2 space-y-4">
                    <div className="grid gap-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        File
                      </label>
                      <Input
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileChange}
                      />
                    </div>

                    {importColumns.length > 0 && (
                      <div className="grid gap-3">
                        <p className="text-xs text-muted-foreground font-medium">
                          Map your columns
                        </p>

                        <div className="grid gap-1">
                          <label className="text-xs text-muted-foreground">
                            Date column
                          </label>
                          <Select
                            value={mapping.date}
                            onValueChange={v =>
                              setMapping(m => ({ ...m, date: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select date column" />
                            </SelectTrigger>
                            <SelectContent>
                              {importColumns.map(c => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-1">
                          <label className="text-xs text-muted-foreground">
                            Merchant column
                          </label>
                          <Select
                            value={mapping.merchant}
                            onValueChange={v =>
                              setMapping(m => ({ ...m, merchant: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select merchant column" />
                            </SelectTrigger>
                            <SelectContent>
                              {importColumns.map(c => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-1">
                          <label className="text-xs text-muted-foreground">
                            Amount column
                          </label>
                          <Select
                            value={mapping.amount}
                            onValueChange={v =>
                              setMapping(m => ({ ...m, amount: v }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select amount column" />
                            </SelectTrigger>
                            <SelectContent>
                              {importColumns.map(c => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>

                  <DialogFooter className="mt-4 flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      size="sm"
                      onClick={handleImportExpenses}
                      disabled={
                        isImporting ||
                        !importData ||
                        !mapping.date ||
                        !mapping.merchant ||
                        !mapping.amount
                      }
                    >
                      {isImporting ? "Importing..." : "Import"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Add expense */}
              <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="gap-1">
                    <Plus className="h-4 w-4" />
                    Add expense
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add new expense</DialogTitle>
                    <DialogDescription>
                      Add a new expense. This is local to the dashboard and not
                      saved to your bank.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-3 py-2">
                    <div className="grid gap-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Date
                      </label>
                      <Popover modal={true}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !newDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {newDate ? (
                              format(newDate, "yyyy-MM-dd")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          className="w-auto p-0"
                          align="start"
                        >
                          <Calendar
                            mode="single"
                            selected={newDate}
                            onSelect={date => setNewDate(date ?? undefined)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="grid gap-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Merchant
                      </label>
                      <Input
                        value={newMerchant}
                        onChange={e => setNewMerchant(e.target.value)}
                        placeholder="Merchant name"
                      />
                    </div>
                    <div className="grid gap-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Type
                      </label>
                      <Select value={newType} onValueChange={setNewType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {allTypes.map(t => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1">
                      <label className="text-xs text-muted-foreground">
                        Amount
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newAmount}
                        onChange={e => setNewAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <DialogFooter className="flex justify-end gap-2">
                    <DialogClose asChild>
                      <Button variant="outline" size="sm">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button size="sm" onClick={handleAdd}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>

          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="w-[180px]">Type</TableHead>
                  <TableHead className="w-[120px] text-right">Amount</TableHead>
                  <TableHead className="w-[60px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="py-6 text-center text-sm text-muted-foreground"
                    >
                      No expenses found for this period yet. Use &quot;Add
                      expense&quot; or &quot;Import&quot; to get started.
                    </TableCell>
                  </TableRow>
                )}

                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.date}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {row.merchant}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={row.type}
                        onValueChange={val => handleTypeChange(row.id, val)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {allTypes.map(t => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        className={cn(
                          "h-8 w-24 text-right text-sm",
                          "bg-background"
                        )}
                        value={row.amount.toString()}
                        onChange={e =>
                          handleAmountChange(row.id, e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        <span className="sr-only">Delete expense</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>

      {/* Duplicate warning dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicate transactions detected</DialogTitle>
            <DialogDescription>
              We found {pendingDuplicateCount} transaction
              {pendingDuplicateCount === 1 ? "" : "s"} that exactly match
              existing records (same date, merchant and amount).
            </DialogDescription>
          </DialogHeader>

          <p className="mb-4 text-xs text-muted-foreground">
            How would you like to proceed?
          </p>

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDuplicatesCancel}
            >
              Cancel import
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDuplicatesSkip}
            >
              Skip duplicates
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleDuplicatesAddAll}
            >
              Add all transactions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PersistenceBanner />
    </div>
  );
}

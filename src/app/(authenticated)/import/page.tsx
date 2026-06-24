"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useRouter } from "next/navigation";
import { usePortfolioContext } from "@/hooks/use-portfolio-context";

export default function ImportPage() {
  const router = useRouter();
  const { selectedId, selectedPortfolio } = usePortfolioContext();
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [importing, setImporting] = useState(false);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setStatus("Importing...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("portfolio_id", selectedId);

    const res = await fetch("/api/import", { method: "POST", body: formData });
    const result = await res.json();

    if (res.ok) {
      setStatus(
        `Successfully imported ${result.imported}/${result.total} companies.` +
        (result.errors.length ? `\n\nErrors:\n${result.errors.join("\n")}` : "")
      );
    } else {
      setStatus(`Error: ${result.error}`);
    }
    setImporting(false);
  };

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader>
          <CardTitle>Import from Excel</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Upload your SOIC Flexicap Excel file to import all companies,
            financial models, valuations, and timeline entries.
          </p>
          <p className="text-sm">
            Importing into: <strong>{selectedPortfolio?.name ?? "Default Portfolio"}</strong>
          </p>
          <Input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <div className="flex gap-2">
            <Button onClick={handleImport} disabled={!file || importing}>
              {importing ? "Importing..." : "Import"}
            </Button>
            <Button variant="outline" onClick={() => router.push("/")}>
              Back to Dashboard
            </Button>
          </div>
          {status && (
            <pre className="whitespace-pre-wrap text-sm p-3 rounded bg-muted">
              {status}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

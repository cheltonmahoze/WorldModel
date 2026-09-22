import { route } from "@/server/api";
import { AppError } from "@/server/errors";
import { auditAs } from "@/server/audit";
import { exportReport } from "@/server/services/reports";
import { z } from "zod";

const querySchema = z.object({
  type: z
    .enum([
      "pipeline",
      "revenue",
      "customers",
      "risks",
      "insights",
      "activities",
      "tickets",
      "audit",
    ])
    .default("pipeline"),
  format: z.enum(["csv", "json"]).default("csv"),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const GET = route({
  query: querySchema,
  rateLimit: "export",
  handler: async ({ auth, query }) => {
    const result = await exportReport(auth.organization.id, query.type, {
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });
    await auditAs(auth, {
      action: "report.exported",
      entityType: "report",
      entityLabel: `${query.type} export (${result.rows.length} rows)`,
      after: {
        type: query.type,
        rows: result.rows.length,
        format: query.format,
      },
      severity: "INFO",
    });
    if (query.format === "json") {
      return {
        data: {
          rows: result.rows,
          filename: result.filename.replace(/\.csv$/, ".json"),
          columns: result.columns,
        },
      };
    }
    return {
      data: {
        rows: result.rows,
        columns: result.columns,
        filename: result.filename,
      },
    };
  },
});


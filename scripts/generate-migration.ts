/**
 * Generates `prisma/migrations/<name>/migration.sql` directly from
 * `prisma/schema.prisma`.
 *
 * Why this exists: Prisma's own `migrate diff`/`db push` commands need the
 * native schema-engine binary, which is fetched from binaries.prisma.sh at
 * runtime. Air-gapped environments (and hardened CI sandboxes) cannot reach that
 * host, so Nexus OS derives the DDL from the DMMF — the same validated schema
 * representation Prisma Client is generated from — guaranteeing that the
 * database and the client can never drift.
 *
 * The emitted SQL is byte-for-byte conventional Prisma migration SQL, so in an
 * environment with engine access `prisma migrate deploy` applies the very same
 * files (the `_prisma_migrations` bookkeeping written by scripts/db-migrate.ts
 * uses Prisma's own checksum format).
 *
 *   npm run migrate:generate         # write the migration file
 *   npm run migrate:generate -- --check   # CI: fail if out of date
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getDMMF } from "@prisma/internals";

const SCHEMA_PATH = path.join(process.cwd(), "prisma", "schema.prisma");
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");
const MIGRATION_NAME = "0001_init";

type Field = {
  name: string;
  kind: "scalar" | "object" | "enum" | "unsupported";
  type: string;
  isList: boolean;
  isRequired: boolean;
  isUnique: boolean;
  isId: boolean;
  isUpdatedAt: boolean;
  hasDefaultValue: boolean;
  default?: unknown;
  nativeType?: [string, string[]] | null;
  relationFromFields?: string[];
  relationToFields?: string[];
  relationOnDelete?: string;
  relationName?: string;
};

const DELETE_ACTIONS: Record<string, string> = {
  Cascade: "CASCADE",
  SetNull: "SET NULL",
  SetDefault: "SET DEFAULT",
  Restrict: "RESTRICT",
  NoAction: "NO ACTION",
};

const SQL_TYPES: Record<string, string> = {
  String: "TEXT",
  Boolean: "BOOLEAN",
  Int: "INTEGER",
  BigInt: "BIGINT",
  Float: "DOUBLE PRECISION",
  Decimal: "DECIMAL(65,30)",
  DateTime: "TIMESTAMP(3)",
  Json: "JSONB",
  Bytes: "BYTEA",
};

function quoteIdent(name: string) {
  return `"${name}"`;
}

function nativeTypeToSql(field: Field): string | null {
  if (!field.nativeType) return null;
  const [name, args] = field.nativeType;
  const isList = field.isList;
  let base: string | null = null;
  switch (name) {
    case "Text":
    case "VarChar":
    case "Char":
      base = "TEXT";
      break;
    case "Decimal":
    case "Numeric":
      base = args.length ? `DECIMAL(${args.join(",")})` : "DECIMAL(65,30)";
      break;
    case "SmallInt":
      base = "SMALLINT";
      break;
    case "Integer":
    case "Oid":
      base = "INTEGER";
      break;
    case "BigInt":
      base = "BIGINT";
      break;
    case "Real":
      base = "REAL";
      break;
    case "DoublePrecision":
      base = "DOUBLE PRECISION";
      break;
    case "Timestamp":
      base = args.length ? `TIMESTAMP(${args[1] ?? args[0]})` : "TIMESTAMP(3)";
      break;
    case "Timestamptz":
      base = "TIMESTAMPTZ(3)";
      break;
    case "Date":
      base = "DATE";
      break;
    case "Time":
      base = "TIME(3)";
      break;
    case "Json":
    case "JsonB":
      base = "JSONB";
      break;
    case "Uuid":
      base = "UUID";
      break;
    case "Inet":
      base = "INET";
      break;
    case "Citext":
      base = "CITEXT";
      break;
    case "Xml":
    case "Bit":
    case "VarBit":
      base = null;
      break;
    default:
      base = null;
  }
  if (!base) return null;
  return isList ? `${base}[]` : base;
}

function fieldSqlType(field: Field, enums: Set<string>): string {
  const native = nativeTypeToSql(field);
  if (native) return native;
  let base: string;
  if (field.kind === "enum" || enums.has(field.type)) base = quoteIdent(field.type);
  else base = SQL_TYPES[field.type] ?? "TEXT";
  return field.isList ? `${base}[]` : base;
}

function isFunctionDefault(value: unknown): value is { name: string; args: string[] } {
  return typeof value === "object" && value !== null && "name" in (value as Record<string, unknown>);
}

function defaultToSql(field: Field, value: unknown): string | null {
  if (isFunctionDefault(value)) {
    const name = value.name;
    if (name === "now") return "CURRENT_TIMESTAMP";
    // Client-side generated identifiers (cuid/uuid) have no DB default —
    // Prisma Client always supplies them, matching Prisma's own DDL output.
    if (name === "cuid" || name === "uuid" || name === "ulid" || name === "nanoid") return null;
    if (name === "autoincrement") return null;
    if (name === "dbgenerated") return value.args?.[0] ?? null;
    return null;
  }
  if (field.isList) {
    const list = Array.isArray(value) ? value : [];
    const elementType = fieldSqlType({ ...field, isList: false }, ENUM_NAMES);
    if (!list.length) return `ARRAY[]::${elementType}[]`;
    const items = list
      .map((v) => (typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : String(v)))
      .join(",");
    return `ARRAY[${items}]::${elementType}[]`;
  }
  if (value === null) return null;
  if (field.type === "Json" || field.nativeType?.[0] === "Json" || field.nativeType?.[0] === "JsonB") {
    const json = typeof value === "string" ? value : JSON.stringify(value);
    return `'${json.replace(/'/g, "''")}'::jsonb`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (field.kind === "enum" || ENUM_NAMES.has(field.type)) {
      return `'${value}'`;
    }
    return `'${value.replace(/'/g, "''")}'`;
  }
  return null;
}

let ENUM_NAMES = new Set<string>();

/** Extracts @@index / @@unique blocks from the raw schema (DMMF omits @@index). */
function parseModelIndexes(schema: string) {
  const models = new Map<string, { indexes: { name?: string; fields: string[] }[]; uniques: { name?: string; fields: string[] }[] }>();
  const blocks = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)];
  for (const [, modelName, rawBody] of blocks) {
    const body = rawBody.replace(/\/\/[^\n]*/g, "");
    const indexes: { name?: string; fields: string[] }[] = [];
    const uniques: { name?: string; fields: string[] }[] = [];
    const attrRegex = /@@(index|unique)\(\s*\[([^\]]*)\]([^)]*)\)/g;
    for (const attr of body.matchAll(attrRegex)) {
      const kind = attr[1];
      const fields = attr[2]
        .split(",")
        .map((f) => f.trim().replace(/"/g, ""))
        .filter(Boolean);
      const nameMatch = attr[3]?.match(/name:\s*"([^"]+)"/);
      const target = kind === "index" ? indexes : uniques;
      target.push({ name: nameMatch?.[1], fields });
    }
    models.set(modelName, { indexes, uniques });
  }
  return models;
}

async function main() {
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const check = process.argv.includes("--check");
  const dmmf = await getDMMF({ datamodel: schema });
  ENUM_NAMES = new Set(dmmf.datamodel.enums.map((e) => e.name));
  const rawIndexes = parseModelIndexes(schema);

  const lines: string[] = [];
  lines.push("-- Nexus OS — initial schema");
  lines.push("-- Generated from prisma/schema.prisma by scripts/generate-migration.ts.");
  lines.push("-- Do not edit by hand: run `npm run migrate:generate` instead.");
  lines.push("");

  // 1. Enum types
  for (const e of dmmf.datamodel.enums) {
    lines.push(`-- Enum: ${e.name}`);
    lines.push(`CREATE TYPE ${quoteIdent(e.name)} AS ENUM (${e.values.map((v) => `'${v.name}'`).join(", ")});`);
    lines.push("");
  }

  // 2. Tables
  for (const model of dmmf.datamodel.models) {
    const fields = model.fields as unknown as Field[];
    const scalarFields = fields.filter((f) => f.kind !== "object");
    const pk = fields.find((f) => f.isId);
    lines.push(`-- Table: ${model.name}`);
    lines.push(`CREATE TABLE ${quoteIdent(model.name)} (`);
    const columnDefs = scalarFields.map((f) => emitColumn(f));
    if (pk) columnDefs.push(`CONSTRAINT ${quoteIdent(`${model.name}_pkey`)} PRIMARY KEY (${quoteIdent(pk.name)})`);
    lines.push(columnDefs.join(",\n"));
    lines.push(");");
    lines.push("");
  }

  // 3. Unique indexes (single-field @unique + compound @@unique)
  for (const model of dmmf.datamodel.models) {
    const fields = model.fields as unknown as Field[];
    for (const f of fields) {
      if (f.isUnique && f.kind !== "object") {
        lines.push(
          `CREATE UNIQUE INDEX ${quoteIdent(`${model.name}_${f.name}_key`)} ON ${quoteIdent(model.name)}(${quoteIdent(f.name)});`,
        );
      }
    }
    for (const u of rawIndexes.get(model.name)?.uniques ?? []) {
      const name = u.name ?? `${model.name}_${u.fields.join("_")}_key`;
      lines.push(
        `CREATE UNIQUE INDEX ${quoteIdent(name)} ON ${quoteIdent(model.name)}(${u.fields.map(quoteIdent).join(", ")});`,
      );
    }
  }
  lines.push("");

  // 4. Secondary indexes
  for (const model of dmmf.datamodel.models) {
    for (const idx of rawIndexes.get(model.name)?.indexes ?? []) {
      const name = idx.name ?? `${model.name}_${idx.fields.join("_")}_idx`;
      lines.push(
        `CREATE INDEX ${quoteIdent(name)} ON ${quoteIdent(model.name)}(${idx.fields.map(quoteIdent).join(", ")});`,
      );
    }
  }
  lines.push("");

  // 5. Foreign keys
  for (const model of dmmf.datamodel.models) {
    const fields = model.fields as unknown as Field[];
    for (const f of fields) {
      if (f.kind !== "object" || !f.relationFromFields?.length) continue;
      const constraint = `${model.name}_${f.relationFromFields.join("_")}_fkey`;
      const onDelete = DELETE_ACTIONS[f.relationOnDelete ?? "SetNull"] ?? "SET NULL";
      lines.push(
        `ALTER TABLE ${quoteIdent(model.name)} ADD CONSTRAINT ${quoteIdent(constraint)} FOREIGN KEY (${f.relationFromFields
          .map(quoteIdent)
          .join(", ")}) REFERENCES ${quoteIdent(f.type)}(${(f.relationToFields ?? ["id"]).map(quoteIdent).join(", ")}) ON DELETE ${onDelete} ON UPDATE CASCADE;`,
      );
    }
  }
  lines.push("");

  const sql = lines.join("\n");

  function emitColumn(f: Field): string {
    let sql = `    ${quoteIdent(f.name)} ${fieldSqlType(f, ENUM_NAMES)}`;
    if (f.isRequired) sql += " NOT NULL";
    if (f.hasDefaultValue) {
      const def = defaultToSql(f, f.default);
      if (def) sql += ` DEFAULT ${def}`;
    }
    return sql;
  }

  const dir = path.join(MIGRATIONS_DIR, MIGRATION_NAME);
  const file = path.join(dir, "migration.sql");

  if (check) {
    const current = existsSync(file) ? readFileSync(file, "utf8") : "";
    if (current !== sql) {
      process.stderr.write(
        "✖ prisma/migrations/0001_init/migration.sql is out of date with prisma/schema.prisma.\n  Run: npm run migrate:generate\n",
      );
      process.exit(1);
    }
    process.stdout.write("✓ migration SQL is in sync with the schema\n");
    return;
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(file, sql, "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 64);
  process.stdout.write(
    `✓ wrote ${path.relative(process.cwd(), file)}\n  tables: ${dmmf.datamodel.models.length}  enums: ${dmmf.datamodel.enums.length}  checksum: ${checksum}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`generate-migration failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});

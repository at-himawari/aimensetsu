#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";

const COGNITO_IMPORT_COLUMNS = [
  "name",
  "given_name",
  "family_name",
  "middle_name",
  "nickname",
  "preferred_username",
  "profile",
  "picture",
  "website",
  "email",
  "email_verified",
  "gender",
  "birthdate",
  "zoneinfo",
  "locale",
  "phone_number",
  "phone_number_verified",
  "address",
  "updated_at",
  "cognito:mfa_enabled",
];

function usage() {
  console.error(`Usage:
  node infra/scripts/prepare-cognito-import.mjs --input old-users.json --out-dir tmp/cognito-import

Input must be a JSON file containing either:
  - an array of Cognito list-users user objects
  - an object with a Users array
`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--input") args.input = argv[++index];
    else if (item === "--out-dir") args.outDir = argv[++index];
    else if (item === "--help" || item === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${item}`);
  }
  return args;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function attrMap(user) {
  return Object.fromEntries((user.Attributes ?? []).map((attribute) => [attribute.Name, attribute.Value]));
}

function isE164(phoneNumber) {
  return /^\+[1-9]\d{7,14}$/.test(phoneNumber);
}

function normalizeVerified(value) {
  return value === true || value === "true" ? "true" : "false";
}

function rowForUser(user) {
  const attributes = attrMap(user);
  const updatedAt = user.UserLastModifiedDate ? Math.floor(new Date(user.UserLastModifiedDate).getTime() / 1000) : "";
  return {
    name: attributes.name ?? "",
    given_name: attributes.given_name ?? "",
    family_name: attributes.family_name ?? "",
    middle_name: "",
    nickname: "",
    preferred_username: "",
    profile: "",
    picture: "",
    website: "",
    email: attributes.email ?? "",
    email_verified: normalizeVerified(attributes.email_verified),
    gender: "",
    birthdate: "",
    zoneinfo: "",
    locale: "ja-JP",
    phone_number: attributes.phone_number ?? "",
    phone_number_verified: normalizeVerified(attributes.phone_number_verified),
    address: "",
    updated_at: updatedAt,
    "cognito:mfa_enabled": user.MFAOptions?.length ? "true" : "false",
    old_username: user.Username ?? "",
    old_sub: attributes.sub ?? "",
  };
}

function loadUsers(inputPath) {
  const payload = JSON.parse(readFileSync(inputPath, "utf8"));
  const users = Array.isArray(payload) ? payload : payload.Users;
  if (!Array.isArray(users)) throw new Error("Input JSON must be an array or an object with Users array.");
  return users;
}

function buildReport(rows) {
  const phoneGroups = new Map();
  const emailGroups = new Map();
  for (const row of rows) {
    if (row.phone_number) {
      const group = phoneGroups.get(row.phone_number) ?? [];
      group.push(row);
      phoneGroups.set(row.phone_number, group);
    }
    if (row.email) {
      const normalizedEmail = row.email.toLowerCase();
      const group = emailGroups.get(normalizedEmail) ?? [];
      group.push(row);
      emailGroups.set(normalizedEmail, group);
    }
  }

  const missingPhone = rows.filter((row) => !row.phone_number);
  const invalidPhone = rows.filter((row) => row.phone_number && !isE164(row.phone_number));
  const unverifiedPhone = rows.filter((row) => row.phone_number_verified !== "true");
  const duplicatePhone = [...phoneGroups.entries()].filter(([, group]) => group.length > 1);
  const duplicateEmail = [...emailGroups.entries()].filter(([, group]) => group.length > 1);

  const lines = [
    "# Cognito import audit report",
    "",
    `Total users: ${rows.length}`,
    `Missing phone_number: ${missingPhone.length}`,
    `Invalid E.164 phone_number: ${invalidPhone.length}`,
    `Unverified phone_number: ${unverifiedPhone.length}`,
    `Duplicate phone_number groups: ${duplicatePhone.length}`,
    `Duplicate email groups: ${duplicateEmail.length}`,
    "",
    "## Blocking issues",
    "",
    "The new user pool uses email and phone_number as unique username attributes. Resolve missing, invalid, and duplicate values before import.",
    "",
  ];

  const appendRows = (title, items) => {
    lines.push(`## ${title}`, "");
    if (!items.length) {
      lines.push("None", "");
      return;
    }
    lines.push("| old_username | old_sub | email | phone_number | phone_number_verified |");
    lines.push("|---|---|---|---|---|");
    for (const row of items) {
      lines.push(
        `| ${row.old_username} | ${row.old_sub} | ${row.email} | ${row.phone_number} | ${row.phone_number_verified} |`,
      );
    }
    lines.push("");
  };

  appendRows("Missing phone_number", missingPhone);
  appendRows("Invalid E.164 phone_number", invalidPhone);
  appendRows("Unverified phone_number", unverifiedPhone);

  lines.push("## Duplicate phone_number", "");
  if (!duplicatePhone.length) {
    lines.push("None", "");
  } else {
    for (const [phoneNumber, group] of duplicatePhone) {
      lines.push(`### ${phoneNumber}`, "");
      appendRows("Accounts", group);
    }
  }

  lines.push("## Duplicate email", "");
  if (!duplicateEmail.length) {
    lines.push("None", "");
  } else {
    for (const [email, group] of duplicateEmail) {
      lines.push(`### ${email}`, "");
      appendRows("Accounts", group);
    }
  }

  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.input || !args.outDir) {
    usage();
    process.exit(args.help ? 0 : 1);
  }

  const inputPath = resolve(args.input);
  const outDir = resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });

  const users = loadUsers(inputPath);
  const rows = users.map(rowForUser);
  const csv = [
    COGNITO_IMPORT_COLUMNS.join(","),
    ...rows.map((row) => COGNITO_IMPORT_COLUMNS.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n");

  writeFileSync(resolve(outDir, "cognito-import.csv"), `${csv}\n`);
  writeFileSync(resolve(outDir, "audit-report.md"), buildReport(rows));
  writeFileSync(
    resolve(outDir, "old-to-new-sub-map.template.csv"),
    ["old_username,old_sub,new_sub,email,phone_number", ...rows.map((row) => [row.old_username, row.old_sub, "", row.email, row.phone_number].map(csvEscape).join(","))].join("\n") + "\n",
  );

  console.log(`Wrote ${rows.length} users to ${outDir}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}


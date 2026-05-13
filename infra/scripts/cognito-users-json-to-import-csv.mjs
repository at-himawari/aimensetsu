#!/usr/bin/env node

import fs from "node:fs";

const defaultHeaders = [
  "cognito:username",
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

function parseArgs(argv) {
  const args = {
    input: null,
    output: null,
    headers: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];
    if (current === "--input") {
      args.input = next;
      index += 1;
    } else if (current === "--output") {
      args.output = next;
      index += 1;
    } else if (current === "--headers") {
      args.headers = next;
      index += 1;
    }
  }

  if (!args.input || !args.output) {
    throw new Error("Usage: node scripts/cognito-users-json-to-import-csv.mjs --input old-users.json --output import-users.csv [--headers csv-header.json]");
  }
  return args;
}

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function getHeaders(path) {
  if (!path) {
    return defaultHeaders;
  }
  const headerJson = readJson(path);
  return headerJson.CSVHeader ?? headerJson.csvHeader ?? headerJson;
}

function attributesToObject(attributes = []) {
  return Object.fromEntries(
    attributes
      .filter((attribute) => attribute.Name && attribute.Value != null)
      .map((attribute) => [attribute.Name, attribute.Value]),
  );
}

function getUsers(inputJson) {
  if (Array.isArray(inputJson)) {
    return inputJson;
  }
  if (Array.isArray(inputJson.Users)) {
    return inputJson.Users;
  }
  throw new Error("Input JSON must be an AWS Cognito list-users response or an array of users.");
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function valueForHeader(header, user, attributes) {
  if (header === "cognito:username") {
    return user.Username;
  }
  if (header === "cognito:mfa_enabled") {
    return "";
  }
  if (header === "email_verified") {
    return attributes.email ? String(attributes.email_verified ?? "true").toUpperCase() : "";
  }
  if (header === "phone_number_verified") {
    return attributes.phone_number ? String(attributes.phone_number_verified ?? "true").toUpperCase() : "";
  }
  if (header === "updated_at") {
    return attributes.updated_at ?? "";
  }
  return attributes[header] ?? "";
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const headers = getHeaders(args.headers);
  const inputJson = readJson(args.input);
  const users = getUsers(inputJson);

  const rows = [
    headers.map(csvEscape).join(","),
    ...users.map((user) => {
      const attributes = attributesToObject(user.Attributes ?? user.UserAttributes);
      return headers.map((header) => csvEscape(valueForHeader(header, user, attributes))).join(",");
    }),
  ];

  fs.writeFileSync(args.output, `${rows.join("\n")}\n`, "utf8");
  console.log(`Wrote ${users.length} users to ${args.output}`);
}

main();

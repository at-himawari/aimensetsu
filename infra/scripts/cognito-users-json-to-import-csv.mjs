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
    defaultPhoneNumber: null,
    requiredAttributes: ["email"],
    usernameAttribute: "email",
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
    } else if (current === "--default-phone-number") {
      args.defaultPhoneNumber = normalizePhoneNumber(next);
      index += 1;
    } else if (current === "--required-attributes") {
      args.requiredAttributes = next.split(",").map((value) => value.trim()).filter(Boolean);
      index += 1;
    } else if (current === "--username-attribute") {
      args.usernameAttribute = next;
      index += 1;
    }
  }

  if (!args.input || !args.output) {
    throw new Error("Usage: node scripts/cognito-users-json-to-import-csv.mjs --input old-users.json --output import-users.csv [--headers csv-header.json] [--default-phone-number 09012345678] [--required-attributes email] [--username-attribute email]");
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

function normalizePhoneNumber(phoneNumber) {
  const normalizedDigits = String(phoneNumber ?? "")
    .trim()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[-ー−\s()（）]/g, "");

  if (/^\+81\d{9,10}$/.test(normalizedDigits)) {
    return normalizedDigits;
  }
  if (/^0\d{9,10}$/.test(normalizedDigits)) {
    return `+81${normalizedDigits.slice(1)}`;
  }
  throw new Error("Default phone number must be a Japanese domestic number or +81 E.164 number.");
}

function applyDefaults(user, defaultPhoneNumber) {
  const attributes = attributesToObject(user.Attributes ?? user.UserAttributes);
  if (attributes.email) {
    attributes.email_verified = attributes.email_verified ?? "true";
  }
  if (!attributes.phone_number && defaultPhoneNumber) {
    attributes.phone_number = defaultPhoneNumber;
    attributes.phone_number_verified = "false";
  }
  return attributes;
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

function validateUsers(users, requiredAttributes, defaultPhoneNumber) {
  const missingRequiredAttributes = [];
  const phoneNumberOwners = new Map();
  const duplicatePhoneNumbers = [];

  users.forEach((user) => {
    const attributes = applyDefaults(user, defaultPhoneNumber);
    requiredAttributes.forEach((attributeName) => {
      if (!attributes[attributeName]) {
        missingRequiredAttributes.push(`${user.Username ?? "(missing username)"}:${attributeName}`);
      }
    });

    const phoneNumber = attributes.phone_number;
    if (phoneNumber && phoneNumber !== defaultPhoneNumber) {
      const existingOwner = phoneNumberOwners.get(phoneNumber);
      if (existingOwner && existingOwner !== user.Username) {
        duplicatePhoneNumbers.push(`${phoneNumber} (${existingOwner}, ${user.Username})`);
      } else {
        phoneNumberOwners.set(phoneNumber, user.Username);
      }
    }
  });

  if (missingRequiredAttributes.length > 0) {
    throw new Error(`Missing required attributes: ${missingRequiredAttributes.join(", ")}`);
  }
  if (duplicatePhoneNumbers.length > 0) {
    throw new Error(`Duplicate phone_number values: ${duplicatePhoneNumbers.join(", ")}`);
  }
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function valueForHeader(header, user, attributes, usernameAttribute) {
  if (header === "cognito:username") {
    return attributes[usernameAttribute] ?? user.Username;
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
  validateUsers(users, args.requiredAttributes, args.defaultPhoneNumber);

  const rows = [
    headers.map(csvEscape).join(","),
    ...users.map((user) => {
      const attributes = applyDefaults(user, args.defaultPhoneNumber);
      return headers.map((header) => csvEscape(valueForHeader(header, user, attributes, args.usernameAttribute))).join(",");
    }),
  ];

  fs.writeFileSync(args.output, `${rows.join("\n")}\n`, "utf8");
  console.log(`Wrote ${users.length} users to ${args.output}`);
}

main();

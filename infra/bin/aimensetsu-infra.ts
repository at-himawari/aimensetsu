#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AuthStack } from "../lib/auth-stack";

const app = new cdk.App();

const projectName = app.node.tryGetContext("projectName") ?? "aimensetsu";
const environmentName = app.node.tryGetContext("environmentName") ?? "dev";
const callbackUrls = app.node.tryGetContext("callbackUrls") ?? ["http://localhost:5173/auth/callback"];
const logoutUrls = app.node.tryGetContext("logoutUrls") ?? ["http://localhost:5173/"];
const cognitoDomainPrefix = app.node.tryGetContext("cognitoDomainPrefix") ?? "";

new AuthStack(app, `${projectName}-${environmentName}-auth`, {
  projectName,
  environmentName,
  callbackUrls,
  logoutUrls,
  cognitoDomainPrefix,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
});


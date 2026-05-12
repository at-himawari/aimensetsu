#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";

import { AimensetsuAppStack } from "../lib/aimensetsu-app-stack";

const app = new cdk.App();

new AimensetsuAppStack(app, "AimensetsuAppStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
  },
});

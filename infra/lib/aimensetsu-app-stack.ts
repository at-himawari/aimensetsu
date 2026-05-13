import * as cdk from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";


export class AimensetsuAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const resumeBucket = new s3.Bucket(this, "ResumeBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
    });

    const userPool = new cognito.UserPool(this, "UserPoolWithPhoneNumber", {
      userPoolName: "aimensetsu",
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      autoVerify: {
        email: false,
        phone: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        phoneNumber: {
          required: true,
          mutable: true,
        },
      },
    });
    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.smsVerificationMessage = "AI面接コーチの確認コードは {####} です。";
    cfnUserPool.verificationMessageTemplate = {
      defaultEmailOption: "CONFIRM_WITH_CODE",
      emailMessage: "The verification code to your new account is {####}",
      emailSubject: "Verify your new account",
      smsMessage: "AI面接コーチの確認コードは {####} です。",
    };
    cfnUserPool.schema = [
      {
        attributeDataType: "String",
        mutable: true,
        name: "email",
        required: true,
      },
      {
        attributeDataType: "String",
        mutable: true,
        name: "phone_number",
        required: true,
      },
    ];

    const preventDuplicatePhoneSignUp = new lambda.Function(this, "PreventDuplicatePhoneSignUp", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromInline(`
const { CognitoIdentityProviderClient, ListUsersCommand } = require("@aws-sdk/client-cognito-identity-provider");

const client = new CognitoIdentityProviderClient({});

function escapeFilterValue(value) {
  return value.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, "\\\\\"");
}

exports.handler = async (event) => {
  const phoneNumber = event.request.userAttributes.phone_number;
  if (!phoneNumber) {
    throw new Error("電話番号を入力してください。");
  }

  const response = await client.send(new ListUsersCommand({
    UserPoolId: event.userPoolId,
    Filter: \`phone_number = "\${escapeFilterValue(phoneNumber)}"\`,
    Limit: 1,
  }));
  const existingUser = response.Users?.find((user) => user.Username !== event.userName);
  if (existingUser) {
    throw new Error("この電話番号はすでに登録されています。");
  }

  return event;
};
      `),
    });
    preventDuplicatePhoneSignUp.addToRolePolicy(new iam.PolicyStatement({
      actions: ["cognito-idp:ListUsers"],
      resources: [
        cdk.Stack.of(this).formatArn({
          service: "cognito-idp",
          resource: "userpool",
          resourceName: "*",
        }),
      ],
    }));
    userPool.addTrigger(cognito.UserPoolOperation.PRE_SIGN_UP, preventDuplicatePhoneSignUp);

    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClientWithPhoneNumber", {
      userPool,
      authFlows: {
        userSrp: true,
        userPassword: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: [
          "http://localhost:5173",
          "http://localhost:5174",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:5174",
        ],
        logoutUrls: [
          "http://localhost:5173",
          "http://localhost:5174",
          "http://127.0.0.1:5173",
          "http://127.0.0.1:5174",
        ],
      },
      generateSecret: false,
    });

    new cdk.CfnOutput(this, "ResumeBucketName", {
      value: resumeBucket.bucketName,
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, "CognitoRegion", {
      value: cdk.Stack.of(this).region,
    });
  }
}

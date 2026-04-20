import { CfnOutput, Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { Construct } from "constructs";

export interface AuthStackProps extends StackProps {
  projectName: string;
  environmentName: string;
  callbackUrls: string[];
  logoutUrls: string[];
  cognitoDomainPrefix?: string;
}

export class AuthStack extends Stack {
  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const isProduction = props.environmentName === "prod";
    const namePrefix = `${props.projectName}-${props.environmentName}`;

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: `${namePrefix}-users`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      signInCaseSensitive: false,
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        fullname: {
          required: true,
          mutable: true,
        },
        phoneNumber: {
          required: false,
          mutable: true,
        },
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      passwordPolicy: {
        minLength: 12,
        requireDigits: true,
        requireLowercase: true,
        requireSymbols: false,
        requireUppercase: true,
        tempPasswordValidity: Duration.days(7),
      },
      removalPolicy: isProduction ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    const cfnUserPool = userPool.node.defaultChild as cognito.CfnUserPool;
    cfnUserPool.addPropertyDeletionOverride("AliasAttributes");
    cfnUserPool.addPropertyOverride("UsernameAttributes", ["email"]);
    cfnUserPool.addPropertyOverride("UserAttributeUpdateSettings.AttributesRequireVerificationBeforeUpdate", ["email"]);
    cfnUserPool.addPropertyOverride("DeletionProtection", isProduction ? "ACTIVE" : "INACTIVE");

    const userPoolClient = userPool.addClient("WebClient", {
      userPoolClientName: `${namePrefix}-web`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      preventUserExistenceErrors: true,
      refreshTokenValidity: Duration.days(30),
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1),
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          fullname: true,
          phoneNumber: true,
          phoneNumberVerified: true,
        }),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          fullname: true,
          phoneNumber: true,
        }),
    });

    if (props.cognitoDomainPrefix) {
      userPool.addDomain("HostedUiDomain", {
        cognitoDomain: {
          domainPrefix: props.cognitoDomainPrefix,
        },
      });
    }

    new CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "COGNITO_USER_POOL_ID",
    });
    new CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "COGNITO_APP_CLIENT_ID",
    });
    new CfnOutput(this, "UserPoolIssuer", {
      value: `https://cognito-idp.${Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}`,
      description: "JWT issuer for backend verification",
    });
    new CfnOutput(this, "Region", {
      value: Stack.of(this).region,
      description: "COGNITO_REGION",
    });
  }
}

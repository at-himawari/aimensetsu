const COGNITO_STATE_KEY = "aimensetsu_cognito_state";
const COGNITO_VERIFIER_KEY = "aimensetsu_cognito_pkce_verifier";

export type CognitoConfig = {
  domain: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
  region: string;
  scopes: string[];
};

export type CognitoTokenResponse = {
  access_token?: string;
  id_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
};

type CognitoAttribute = {
  Name: string;
  Value: string;
};

type CognitoAuthResult = {
  AccessToken?: string;
  IdToken?: string;
  RefreshToken?: string;
  ExpiresIn?: number;
  TokenType?: string;
};

type InitiateAuthResponse = {
  AuthenticationResult?: CognitoAuthResult;
  ChallengeName?: string;
};

type SignUpResponse = {
  CodeDeliveryDetails?: {
    AttributeName?: string;
    DeliveryMedium?: string;
    Destination?: string;
  };
  UserConfirmed?: boolean;
  UserSub?: string;
};

type ResendConfirmationCodeResponse = {
  CodeDeliveryDetails?: {
    AttributeName?: string;
    DeliveryMedium?: string;
    Destination?: string;
  };
};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function inferRegionFromDomain(domain: string) {
  const match = domain.match(/\.auth\.([a-z0-9-]+)\.amazoncognito\.com$/);
  return match?.[1] ?? "";
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array) {
  const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  byteArray.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createRandomString(length = 64) {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

async function createCodeChallenge(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

export function getCognitoConfig(env: ImportMetaEnv = import.meta.env): CognitoConfig | null {
  const domain = env.VITE_COGNITO_DOMAIN || "";
  const clientId = env.VITE_COGNITO_CLIENT_ID;
  const trimmedDomain = domain ? trimTrailingSlash(domain) : "";
  const region = env.VITE_COGNITO_REGION || inferRegionFromDomain(trimmedDomain);
  if (!clientId || !region) {
    return null;
  }

  const currentOrigin = typeof window === "undefined" ? "" : window.location.origin;
  return {
    domain: trimmedDomain,
    clientId,
    redirectUri: env.VITE_COGNITO_REDIRECT_URI || currentOrigin,
    logoutUri: env.VITE_COGNITO_LOGOUT_URI || currentOrigin,
    region,
    scopes: (env.VITE_COGNITO_SCOPES || "openid email profile").split(/\s+/).filter(Boolean),
  };
}

async function buildCognitoInteractiveUrl(config: CognitoConfig, path: "/oauth2/authorize" | "/signup") {
  const state = createRandomString(32);
  const verifier = createRandomString(64);
  const challenge = await createCodeChallenge(verifier);

  window.sessionStorage.setItem(COGNITO_STATE_KEY, state);
  window.sessionStorage.setItem(COGNITO_VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: config.clientId,
    code_challenge: challenge,
    code_challenge_method: "S256",
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state,
  });
  return `${config.domain}${path}?${params.toString()}`;
}

export function buildCognitoLoginUrl(config: CognitoConfig) {
  return buildCognitoInteractiveUrl(config, "/oauth2/authorize");
}

export function buildCognitoSignupUrl(config: CognitoConfig) {
  return buildCognitoInteractiveUrl(config, "/signup");
}

export function buildCognitoLogoutUrl(config: CognitoConfig) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    logout_uri: config.logoutUri,
  });
  return `${config.domain}/logout?${params.toString()}`;
}

function cognitoEndpoint(config: CognitoConfig) {
  if (!config.region) {
    throw new Error("ログイン設定が不足しています。");
  }
  return `https://cognito-idp.${config.region}.amazonaws.com/`;
}

function friendlyCognitoError(errorType: string, fallback: string) {
  if (errorType.includes("NotAuthorizedException")) {
    return "メールアドレスまたはパスワードが正しくありません。";
  }
  if (errorType.includes("UsernameExistsException")) {
    return "このメールアドレスはすでに登録されています。";
  }
  if (errorType.includes("LimitExceededException") || errorType.includes("TooManyRequestsException")) {
    return "確認コードの送信回数が多すぎます。しばらく待ってから再度お試しください。";
  }
  if (errorType.includes("UserNotConfirmedException")) {
    return "電話番号確認が完了していません。SMSの確認コードを入力してください。";
  }
  if (errorType.includes("CodeMismatchException")) {
    return "確認コードが正しくありません。";
  }
  if (errorType.includes("ExpiredCodeException")) {
    return "確認コードの有効期限が切れています。";
  }
  if (errorType.includes("InvalidPasswordException")) {
    return "パスワードは8文字以上で、英大文字・英小文字・数字・記号を含めてください。";
  }
  if (errorType.includes("InvalidParameterException")) {
    return fallback || "入力内容を確認してください。";
  }
  if (errorType.includes("PasswordResetRequiredException")) {
    return "パスワード再設定が必要です。パスワード再設定から手続きしてください。";
  }
  return fallback || "処理に失敗しました。時間をおいて再度お試しください。";
}

async function callCognito<T>(config: CognitoConfig, action: string, payload: object): Promise<T> {
  const response = await fetch(cognitoEndpoint(config), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${action}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorType = String(body.__type ?? body.code ?? "");
    throw new Error(friendlyCognitoError(errorType, body.message ?? ""));
  }
  return body as T;
}

export function normalizeJapanesePhoneNumber(phoneNumber: string) {
  const normalizedDigits = phoneNumber
    .trim()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[-ー−\s()（）]/g, "");

  if (!/^0\d{9,10}$/.test(normalizedDigits)) {
    throw new Error("電話番号は国内の番号で入力してください。例: 090-1234-5678");
  }

  return `+81${normalizedDigits.slice(1)}`;
}

export async function signUpWithCognito(
  config: CognitoConfig,
  payload: { email: string; password: string; phoneNumber: string; name?: string },
) {
  const phoneNumber = normalizeJapanesePhoneNumber(payload.phoneNumber);
  const userAttributes: CognitoAttribute[] = [
    { Name: "email", Value: payload.email },
    { Name: "phone_number", Value: phoneNumber },
  ];
  if (payload.name) {
    userAttributes.push({ Name: "name", Value: payload.name });
  }

  return callCognito<SignUpResponse>(config, "SignUp", {
    ClientId: config.clientId,
    Username: payload.email,
    Password: payload.password,
    UserAttributes: userAttributes,
  });
}

export function confirmSignUpWithCognito(config: CognitoConfig, payload: { email: string; code: string }) {
  return callCognito(config, "ConfirmSignUp", {
    ClientId: config.clientId,
    Username: payload.email,
    ConfirmationCode: payload.code,
  });
}

export function resendConfirmationCodeWithCognito(config: CognitoConfig, payload: { email: string }) {
  return callCognito<ResendConfirmationCodeResponse>(config, "ResendConfirmationCode", {
    ClientId: config.clientId,
    Username: payload.email,
  });
}

export async function loginWithCognitoPassword(
  config: CognitoConfig,
  payload: { email: string; password: string },
) {
  const response = await callCognito<InitiateAuthResponse>(config, "InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: config.clientId,
    AuthParameters: {
      USERNAME: payload.email,
      PASSWORD: payload.password,
    },
  });

  if (!response.AuthenticationResult?.IdToken && !response.AuthenticationResult?.AccessToken) {
    throw new Error(response.ChallengeName ? "追加の認証手続きが必要です。" : "ログイン情報を取得できませんでした。");
  }

  return {
    accessToken: response.AuthenticationResult.AccessToken,
    idToken: response.AuthenticationResult.IdToken,
    refreshToken: response.AuthenticationResult.RefreshToken,
  };
}

export function readCognitoCallback(search: string) {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return null;
  }
  return { code, state };
}

export async function exchangeCognitoCode(config: CognitoConfig, code: string, state: string) {
  const expectedState = window.sessionStorage.getItem(COGNITO_STATE_KEY);
  const verifier = window.sessionStorage.getItem(COGNITO_VERIFIER_KEY);
  if (!expectedState || !verifier || expectedState !== state) {
    throw new Error("Cognito のログイン状態を確認できませんでした。");
  }

  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    }),
  });

  window.sessionStorage.removeItem(COGNITO_STATE_KEY);
  window.sessionStorage.removeItem(COGNITO_VERIFIER_KEY);

  if (!response.ok) {
    throw new Error("Cognito のトークン取得に失敗しました。");
  }
  return (await response.json()) as CognitoTokenResponse;
}

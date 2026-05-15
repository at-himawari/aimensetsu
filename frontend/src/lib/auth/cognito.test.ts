import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildCognitoLoginUrl,
  buildCognitoLogoutUrl,
  buildCognitoSignupUrl,
  confirmForgotPasswordWithCognito,
  exchangeCognitoCode,
  forgotPasswordWithCognito,
  loginWithCognitoPassword,
  normalizeJapanesePhoneNumber,
  readCognitoCallback,
  signUpWithCognito,
  type CognitoConfig,
} from "./cognito";

const config: CognitoConfig = {
  domain: "https://example.auth.ap-northeast-1.amazoncognito.com",
  clientId: "client_1",
  redirectUri: "http://localhost:5173",
  logoutUri: "http://localhost:5173",
  region: "ap-northeast-1",
  scopes: ["openid", "email", "profile"],
};

describe("cognito auth helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    Object.defineProperty(window, "crypto", {
      configurable: true,
      value: {
        getRandomValues: (array: Uint8Array) => {
          array.fill(1);
          return array;
        },
        subtle: {
          digest: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
        },
      },
    });
  });

  it("builds a Hosted UI login URL with PKCE parameters", async () => {
    const loginUrl = new URL(await buildCognitoLoginUrl(config));

    expect(loginUrl.origin).toBe(config.domain);
    expect(loginUrl.pathname).toBe("/oauth2/authorize");
    expect(loginUrl.searchParams.get("client_id")).toBe(config.clientId);
    expect(loginUrl.searchParams.get("response_type")).toBe("code");
    expect(loginUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(loginUrl.searchParams.get("scope")).toBe("openid email profile");
    expect(window.sessionStorage.getItem("aimensetsu_cognito_state")).toBeTruthy();
    expect(window.sessionStorage.getItem("aimensetsu_cognito_pkce_verifier")).toBeTruthy();
  });

  it("builds a Hosted UI sign-up URL with PKCE parameters", async () => {
    const signupUrl = new URL(await buildCognitoSignupUrl(config));

    expect(signupUrl.origin).toBe(config.domain);
    expect(signupUrl.pathname).toBe("/signup");
    expect(signupUrl.searchParams.get("client_id")).toBe(config.clientId);
    expect(signupUrl.searchParams.get("response_type")).toBe("code");
    expect(signupUrl.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("builds a Cognito logout URL", () => {
    const logoutUrl = new URL(buildCognitoLogoutUrl(config));

    expect(logoutUrl.pathname).toBe("/logout");
    expect(logoutUrl.searchParams.get("client_id")).toBe(config.clientId);
    expect(logoutUrl.searchParams.get("logout_uri")).toBe(config.logoutUri);
  });

  it("normalizes domestic Japanese phone numbers for Cognito", () => {
    expect(normalizeJapanesePhoneNumber("090-1234-5678")).toBe("+819012345678");
    expect(normalizeJapanesePhoneNumber("０３-１２３４-５６７８")).toBe("+81312345678");
    expect(() => normalizeJapanesePhoneNumber("+819012345678")).toThrow("電話番号は国内の番号で入力してください。");
  });

  it("sends a normalized phone number on sign up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ UserConfirmed: false }),
      })),
    );

    await signUpWithCognito(config, {
      email: "user@example.com",
      password: "Password1!",
      phoneNumber: "090-1234-5678",
      name: "User",
    });

    expect(fetch).toHaveBeenCalledWith(
      "https://cognito-idp.ap-northeast-1.amazonaws.com/",
      expect.objectContaining({
        body: expect.stringContaining('"Value":"+819012345678"'),
      }),
    );
  });

  it("shows a friendly message when Cognito rejects an incorrect password", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 400,
        headers: new Headers({ "x-amzn-errortype": "NotAuthorizedException:" }),
        json: async () => ({ message: "Incorrect username or password." }),
      })),
    );

    await expect(loginWithCognitoPassword(config, {
      email: "user@example.com",
      password: "wrong-password",
    })).rejects.toThrow("メールアドレスまたはパスワードが正しくありません。");
  });

  it("sends and confirms a forgot password code", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: new Headers(),
      json: async () => ({}),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await forgotPasswordWithCognito(config, { email: "migrated@example.com" });
    await confirmForgotPasswordWithCognito(config, {
      email: "migrated@example.com",
      code: "123456",
      newPassword: "NewPassword1!",
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://cognito-idp.ap-northeast-1.amazonaws.com/",
      expect.objectContaining({
        body: JSON.stringify({
          ClientId: config.clientId,
          Username: "migrated@example.com",
        }),
        headers: expect.objectContaining({
          "X-Amz-Target": "AWSCognitoIdentityProviderService.ForgotPassword",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://cognito-idp.ap-northeast-1.amazonaws.com/",
      expect.objectContaining({
        body: JSON.stringify({
          ClientId: config.clientId,
          Username: "migrated@example.com",
          ConfirmationCode: "123456",
          Password: "NewPassword1!",
        }),
        headers: expect.objectContaining({
          "X-Amz-Target": "AWSCognitoIdentityProviderService.ConfirmForgotPassword",
        }),
      }),
    );
  });

  it("reads and exchanges an OAuth callback", async () => {
    const loginUrl = new URL(await buildCognitoLoginUrl(config));
    const state = loginUrl.searchParams.get("state") ?? "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ id_token: "id-token" }),
      })),
    );

    const callback = readCognitoCallback(`?code=code_1&state=${state}`);
    expect(callback).toEqual({ code: "code_1", state });

    const tokenResponse = await exchangeCognitoCode(config, "code_1", state);

    expect(tokenResponse.id_token).toBe("id-token");
    expect(fetch).toHaveBeenCalledWith(
      `${config.domain}/oauth2/token`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(window.sessionStorage.getItem("aimensetsu_cognito_state")).toBeNull();
  });
});

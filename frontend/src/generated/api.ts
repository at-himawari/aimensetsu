export type components = {
  schemas: {
    AuthMeResponseEnvelope: {
      data: {
        user_id: string;
        name: string;
        email?: string | null;
        phone_number?: string | null;
        auth_provider: "demo" | "cognito";
        roles: Array<"user" | "admin">;
        credit_balance_minutes?: number;
      };
      meta: {
        request_id: string;
      };
    };
    ErrorResponse: {
      error: {
        code:
          | "INVALID_REQUEST"
          | "UNAUTHORIZED"
          | "FORBIDDEN"
          | "NOT_FOUND"
          | "CONFLICT"
          | "INSUFFICIENT_CREDITS"
          | "INVALID_STATE"
          | "INVALID_FILE_TYPE"
          | "FILE_TOO_LARGE"
          | "S3_UPLOAD_FAILED"
          | "AI_SERVICE_UNAVAILABLE"
          | "STRIPE_ERROR"
          | "INVALID_WEBHOOK_SIGNATURE";
        message: string;
      };
    };
  };
};

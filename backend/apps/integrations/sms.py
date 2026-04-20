import os


class LocalSmsSender:
    def send_verification_code(self, phone_number: str, code: str) -> dict[str, str]:
        return {"mode": "local", "phone_number": phone_number, "code": code}


class SnsSmsSender:
    def send_verification_code(self, phone_number: str, code: str) -> dict[str, str]:
        import boto3

        client = boto3.client("sns", region_name=os.getenv("AWS_REGION", os.getenv("COGNITO_REGION", "ap-northeast-1")))
        response = client.publish(
            PhoneNumber=phone_number,
            Message=f"AI面接コーチの確認コード: {code}",
        )
        return {"mode": "sns", "message_id": response.get("MessageId", "")}


def get_sms_sender() -> LocalSmsSender | SnsSmsSender:
    if os.getenv("SMS_PROVIDER") == "sns":
        return SnsSmsSender()
    return LocalSmsSender()

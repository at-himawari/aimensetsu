# Cognito移行監査サマリ

対象旧User Pool: `ap-northeast-1_HOHoMMORy`

実行日: 2026-04-13

## 旧User Pool設定

- `UsernameAttributes`: `email`
- `AliasAttributes`: なし
- `AutoVerifiedAttributes`: `email`
- `phone_number.Required`: `false`
- `phone_number.Mutable`: `true`

## ユーザー監査結果

- 総ユーザー数: 9
- `phone_number` 欠損: 9
- `phone_number` E.164形式不正: 0
- `phone_number_verified=false`: 9
- `phone_number` 重複グループ: 0
- `email` 重複グループ: 0

## 判断

旧User Poolはメールアドレスのみをサインイン用の一意値として扱っています。電話番号は任意属性で、自動検証対象でもありません。そのため、旧User Poolをそのまま更新して「電話番号認証」と「電話番号重複登録不可」を満たすことはできません。

案Aで新User PoolへCSV一括インポートする場合、現在の旧ユーザー9件は全員 `phone_number` が未登録のため、そのままでは新User Poolの要件を満たしません。

## 次の対応

1. 既存ユーザー9名の電話番号を収集する。
2. 電話番号をE.164形式に正規化する。例: `09012345678` -> `+819012345678`
3. 電話番号重複がないことを確認する。
4. `tmp/cognito-import/cognito-import.csv` の `phone_number` と `phone_number_verified` を更新する。
5. 再度 `infra/scripts/prepare-cognito-import.mjs` 相当の監査を行う。
6. 問題がなければ新User PoolへCSVインポートする。

## 生成物

ローカルに次のファイルを生成しました。`tmp/` はGit管理対象外です。

- `tmp/old-cognito-users.json`
- `tmp/old-cognito-user-pool-settings.json`
- `tmp/cognito-import/cognito-import.csv`
- `tmp/cognito-import/audit-report.md`
- `tmp/cognito-import/old-to-new-sub-map.template.csv`


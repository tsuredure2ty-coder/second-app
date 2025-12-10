# Netlifyデプロイ手順

## 1. Netlifyアカウント作成
1. https://netlify.com にアクセス
2. 「Sign up」でアカウント作成（GitHub/Google/EmailでOK）

## 2. デプロイ
1. Netlifyダッシュボードで「Add new site」→「Deploy manually」
2. `timer_pomodoro_web`フォルダをドラッグ&ドロップ
3. デプロイ完了（数分）

## 3. 環境変数設定
1. サイト設定 → Environment variables
2. 以下を追加：
   - `NOTION_TOKEN`: あなたのNotionシークレット
   - `NOTION_DATABASE_ID`: あなたのデータベースID
3. 「Save」→「Redeploy」

## 4. 動作確認
- タイマー完了時にNotionに記録されるか確認
- 複数画像アップロード・ランダム表示確認

## 5. カスタムドメイン（任意）
- Site settings → Domain management
- 「Add custom domain」で独自ドメイン設定

完了！



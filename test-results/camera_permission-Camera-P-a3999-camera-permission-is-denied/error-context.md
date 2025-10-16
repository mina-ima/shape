# Page snapshot

```yaml
- generic [ref=e3]:
    - heading "shape" [level=1] [ref=e4]
    - generic [ref=e5]:
        - generic [ref=e6]:
            - heading "Segmentation Demo" [level=2] [ref=e7]
            - paragraph [ref=e8]: 画像を選んで「セグメント実行」を押してください。
            - generic [ref=e9]:
                - generic [ref=e10]:
                    - button "Choose File" [ref=e11]
                    - button "セグメント実行" [disabled] [ref=e13]
                - generic [ref=e15]: 出力マスク
        - generic [ref=e17]:
            - strong [ref=e18]: "Unsplash API Key:"
            - generic [ref=e19]: 設定済み（test-k…）
        - generic [ref=e20]:
            - strong [ref=e21]: "Processing Resolution:"
            - text: 360px
        - generic [ref=e22]:
            - strong [ref=e23]: "Status:"
            - text: error
            - generic [ref=e24]: "— Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: Failed to load model because protobuf parsing failed."
    - button "撮影/選択" [ref=e25] [cursor=pointer]: 処理を開始
    - generic [ref=e26]:
        - heading "エラー" [level=3] [ref=e27]
        - paragraph [ref=e28]: "Can't create a session. ERROR_CODE: 7, ERROR_MESSAGE: Failed to load model because protobuf parsing failed."
        - button "リトライ" [ref=e29]
    - paragraph [ref=e30]:
        - text: 例：
        - code [ref=e31]: http://localhost:4173/#unsplash_api_key=YOUR_KEY
        - text: の形式で開けば自動設定されます。
```

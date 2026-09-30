# claude-statusline-progress

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933.svg)](https://nodejs.org/)

Claude Code の statusline に，タスクの進捗を表示する script．

Claude Code が長い作業で作るタスク一覧（TaskCreate / TaskUpdate / TodoWrite）を会話ログから読み，完了数，今のタスク，経過時間を画面の一番下に表示する．タスク一覧が無いときは，今の依頼での経過時間，tool の呼び出し回数，編集した file の数を表示する．依存 package はなく，Node.js だけで動く．

```
✻ Opus 5.5 │ my-app │ ● ● ● ◉ ○ ○ 3/6 テストを修正中 23m
```

## 使い始める

script を `~/.claude` に置く．

```bash
git clone https://github.com/aururn/claude-statusline-progress.git
cp claude-statusline-progress/statusline-progress.js ~/.claude/
```

`~/.claude/settings.json` に statusline の設定を足す．

```json
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/statusline-progress.js --style=pips"
  }
}
```

Windows では `~` の代わりに絶対 path を書く（例：`node C:/Users/<name>/.claude/statusline-progress.js`）．

表示の見本は，次の command で確認できる．

```bash
node ~/.claude/statusline-progress.js --demo
```

## Highlights

**4 種類のスタイル．** `pips`，`aurora`，`pill`，`line` から `--style` で選べる．

**今のタスクが分かる．** 作業中のタスク名と，全部終わったときの `✓ 完了` を表示する．

**タスクが無くても何か出る．** タスク一覧が無い依頼では，`◌ 23m · 61 tools · 11 files` のように作業の量を表示する．

**経過時間を表示する．** 最初のタスクを作ってからの時間を出し，全部終わった時点で止める．

**長い会話でも軽い．** 読んだ位置を cache に残し，会話ログの増えた分だけを読む．

**依存 package なし．** Node.js の標準 module だけで動く．

## Documentation

- [スタイル一覧](docs/styles.md)
- [仕組みと制限](docs/how-it-works.md)

## License

[Apache License 2.0](LICENSE)

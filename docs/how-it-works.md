# 仕組みと制限

## 仕組み

1. Claude Code は statusline の command を実行し，stdin に JSON を渡す．この JSON には model 名，作業 folder，会話ログの path（`transcript_path`）が入っている．
2. script は会話ログ（JSONL）を読み，タスク操作の tool 呼び出しを順に適用して，今のタスク一覧を作る．
   - `TaskCreate`：tool の結果に含まれる `#<id>` を id としてタスクを足す．
   - `TaskUpdate`：`taskId` のタスクの status，subject，activeForm を更新する．`deleted` なら消す．
   - `TodoWrite`：一覧全体を置き換える．
3. 読み終えた位置とタスク一覧を `~/.claude/statusline-cache/<session_id>.json` に保存する．次の呼び出しでは，会話ログの増えた分だけを読む．
4. 一覧から完了数と作業中のタスクを求め，選んだスタイルで 1 行を出力する．

経過時間は，最初のタスクを作った時刻から数える．全てのタスクが完了した場合は，最後に更新した時刻で止める．

## 制限

- 点やバーが出るのは，Claude がタスク一覧を作ったときだけ．短い作業では作られないので，model 名と folder 名だけが出る．
- 分母は，その時点でのタスクの数．作業の途中でタスクが増えると，割合が下がることがある．
- タスク機能が無いセッション（一部の子セッションなど）では，点やバーは出ない．
- 長い作業で必ず表示させたい場合は，CLAUDE.md に「3 手順以上の作業では，始める前にタスク一覧を作る」などと書いておくとよい．
- cache は session ごとに 1 file 作られる．不要になったら `~/.claude/statusline-cache` を消してよい．

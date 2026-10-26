#!/usr/bin/env bash
# Stand-in for `claude -p` (tests and smoke runs only; never the real CLI).
# Behaviour comes from env vars, which the runner passes as explicit extras through childEnv():
#   FAKE_CLAUDE_MODE  ok (default) | sleep | exit1 | auth | big | env | prose | hang_ok
#   FAKE_CLAUDE_OUT   file whose content is the JSON payload (ok/sleep modes); default: 3 valid quests
#   FAKE_CLAUDE_SLEEP seconds to sleep first (sleep mode; default 5)
#   FAKE_CLAUDE_LOG   if set, append "argv|stdin-bytes|cwd" lines here (never the prompt text itself)
stdin="$(cat)"
if [ -n "$FAKE_CLAUDE_LOG" ]; then
  printf '%s|%s|%s\n' "$*" "${#stdin}" "$PWD" >> "$FAKE_CLAUDE_LOG"
fi
mode="${FAKE_CLAUDE_MODE:-ok}"
default='{"quests":[{"title":"Stretch for ten minutes by the window","why":"Stiff shoulders make poor tea.","category":"body","difficulty":"easy","minutes":10,"cost":"free","done_when":"Ten minutes stretched"},{"title":"Sketch one object on your desk","why":"Ink is cheaper than worry.","category":"creative","difficulty":"medium","minutes":30,"cost":"free","done_when":"One sketch exists"},{"title":"Message a classmate about a study session","why":"Gossip spreads; so can notes.","category":"social","difficulty":"medium","minutes":25,"cost":"free","done_when":"Message sent"}]}'
payload="$default"
if [ -n "$FAKE_CLAUDE_OUT" ] && [ -f "$FAKE_CLAUDE_OUT" ]; then payload="$(cat "$FAKE_CLAUDE_OUT")"; fi
envelope() { printf '{"type":"result","subtype":"success","is_error":false,"duration_ms":5,"result":"","structured_output":%s}\n' "$1"; }
case "$mode" in
  ok) envelope "$payload" ;;
  sleep) sleep "${FAKE_CLAUDE_SLEEP:-5}"; envelope "$payload" ;;
  hang_ok) trap '' TERM; while :; do sleep 0.1; done ;;
  exit1) echo "boom" >&2; exit 1 ;;
  auth) echo '{"type":"result","subtype":"success","is_error":true,"result":"Invalid API key · Please run /login"}'; exit 1 ;;
  big) head -c 400000 /dev/zero | tr '\0' 'a'; echo ;;
  prose) printf '{"type":"result","subtype":"success","is_error":false,"result":"Here you go! Sorry, no JSON today."}\n' ;;
  env) keys="$(env | cut -d= -f1 | sort | tr '\n' ',')"; printf '{"type":"result","subtype":"success","is_error":false,"result":"%s"}\n' "$keys" ;;
  *) echo "unknown mode" >&2; exit 2 ;;
esac

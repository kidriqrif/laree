#!/usr/bin/env bash
# Back up the running local stack and restore the files again, to show that backup.sh and
# restore-files.sh work, and that the address check refuses what it must. Run after
# `npm run db:start`: `npm run check:backup`. It adds a test file to the bucket and removes it.
set -euo pipefail

status="$(supabase status -o json)"
get() { node -e 'process.stdout.write(JSON.parse(process.argv[1])[process.argv[2]] ?? "")' "$status" "$1"; }
DB_URL="$(get DB_URL)"
SUPABASE_URL="$(get API_URL)"
SUPABASE_SECRET_KEY="$(get SECRET_KEY)"
[ -n "$SUPABASE_SECRET_KEY" ] || SUPABASE_SECRET_KEY="$(get SERVICE_ROLE_KEY)"
export DB_URL SUPABASE_URL SUPABASE_SECRET_KEY ALLOW_LOCAL_HTTP=1
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d)"
name="00000000-0000-4000-a000-$(printf '%012d' $$)/check.fit"
object="$SUPABASE_URL/storage/v1/object/activity-files/$name"
auth=(-H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY")
upload() { curl -fsS -o /dev/null -X POST "${auth[@]}" -H 'x-upsert: true' -H 'Content-Type: application/octet-stream' --data-binary "@$1" "$object"; }
cleanup() {
  curl -fsS -o /dev/null -X DELETE "${auth[@]}" "$object" || true
  rm -rf "$work"
}
trap cleanup EXIT
fail() { echo "check-backup: $*" >&2; exit 1; }

head -c 3000 /dev/urandom > "$work/first"
head -c 4000 /dev/urandom > "$work/second"
upload "$work/first"

# 1. A plain backup holds the rows and the file, byte for byte.
"$here/backup.sh" "$work/one" > /dev/null
[ -s "$work/one/data.sql" ] || fail "no rows were dumped"
grep -qx "$name" "$work/one/files.txt" || fail "the file is not listed"
cmp -s "$work/first" "$work/one/files/$name" || fail "the file's bytes differ"

# 2. A file replaced while the rows are dumped: the backup starts again and keeps the new bytes.
cat > "$work/cli" <<SH
#!/usr/bin/env bash
if [ ! -e "$work/replaced" ]; then
  touch "$work/replaced"
  curl -fsS -o /dev/null -X POST -H "apikey: \$SUPABASE_SECRET_KEY" -H "Authorization: Bearer \$SUPABASE_SECRET_KEY" \
    -H 'x-upsert: true' -H 'Content-Type: application/octet-stream' --data-binary "@$work/second" "$object"
fi
exec supabase "\$@"
SH
chmod +x "$work/cli"
SUPABASE_CLI="$work/cli" "$here/backup.sh" "$work/two" > /dev/null 2> "$work/two.log"
grep -q 'changed while the rows were dumped' "$work/two.log" || fail "the change during the dump went unseen"
cmp -s "$work/second" "$work/two/files/$name" || fail "the backup kept the replaced bytes"

# 3. The restore puts the file back.
curl -fsS -o /dev/null -X DELETE "${auth[@]}" "$object"
"$here/restore-files.sh" "$work/two" > /dev/null
curl -fsS "${auth[@]}" -o "$work/restored" "$object"
cmp -s "$work/second" "$work/restored" || fail "the restored file differs"

# 4. The secret key never goes to an address with a user part, or over HTTP to another machine.
for url in 'http://localhost:123@example.invalid' 'http://example.invalid' 'http://127.0.0.1.example.invalid:1'; do
  if SUPABASE_URL="$url" "$here/backup.sh" "$work/bad" > /dev/null 2>&1; then fail "backup.sh accepted $url"; fi
  if SUPABASE_URL="$url" "$here/restore-files.sh" "$work/two" > /dev/null 2>&1; then fail "restore-files.sh accepted $url"; fi
done
echo "Backup and restore work, and unsafe addresses are refused."

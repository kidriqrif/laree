#!/usr/bin/env bash
# Back up the rows and the original activity files together, so that they match:
#
#   DB_URL=... SUPABASE_URL=... SUPABASE_SECRET_KEY=... scripts/backup.sh dump
#
# writes <dir>/data.sql (the rows of the app's tables and the accounts), <dir>/files/ (every file
# in the private bucket) and <dir>/files.txt (their names). SUPABASE_SECRET_KEY is the project's
# secret (service role) key: the bucket is private. SUPABASE_CLI names the Supabase CLI command
# ("supabase" by default; "npx supabase" works too).
#
# The dump reads the rows at one moment; the files are read after it. So the bucket's inventory
# (each file's name, version, size and time, from the database) is taken three times: before the
# dump, after it, and after the downloads. The backup is kept only when all three agree: then no
# file was added, deleted or replaced in place from before the dump began until the last download
# ended, and the files are exactly those the dump's moment saw. Every inventoried file must
# download with its recorded size. Otherwise everything is done again, up to three times, and
# then the backup fails. Files with names the backup does not accept are left out and listed in
# <dir>/files.refused.txt.
set -euo pipefail

dir="${1:?usage: backup.sh <dir>}"
: "${DB_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SECRET_KEY:?}"
# shellcheck source=scripts/supabase-url.sh
. "$(dirname "$0")/supabase-url.sh"
check_supabase_url "$SUPABASE_URL"
base="${SUPABASE_URL%/}"
read -ra cli <<< "${SUPABASE_CLI:-supabase}"
bucket=activity-files
# {athlete id}/{file name}: the only shape the app writes and the access rules allow.
shape='^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# One line per file: name, version, size in bytes, last change. Tabs never occur in a name (shape).
# A name of another shape is never written to disk (".." would climb out of <dir>): it goes to
# <file>.refused instead, and the backup goes on without it. The upload rules refuse such names
# (20261117000000_file_names.sql), so one can only be older than them or put there by hand.
inventory() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -At -F $'\t' -c "
    select name, coalesce(version, ''), coalesce(metadata->>'size', ''), updated_at
    from storage.objects where bucket_id = '$bucket' order by name" > "$1.all"
  : > "$1"
  : > "$1.refused"
  while IFS= read -r line; do
    name="${line%%$'\t'*}"
    if [[ "$name" =~ $shape ]] && [[ "$name" != *..* ]]; then
      printf '%s\n' "$line" >> "$1"
    else
      printf '%s\n' "$name" >> "$1.refused"
    fi
  done < "$1.all"
}

# Download every file of an inventory into a fresh <dir>/files. Fails on the first file that
# cannot be fetched or does not have its recorded size.
fetch() {
  rm -rf "$dir/files"
  mkdir -p "$dir/files"
  while IFS=$'\t' read -r name _ size _; do
    mkdir -p "$dir/files/$(dirname "$name")"
    if ! curl -fsS --proto "$proto" --retry 3 -o "$dir/files/$name" \
      -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
      "$base/storage/v1/object/$bucket/$name"; then
      echo "Could not download $name" >&2
      return 1
    fi
    if [ -n "$size" ] && [ "$(wc -c < "$dir/files/$name" | tr -d ' ')" != "$size" ]; then
      echo "$name did not download whole: expected $size bytes" >&2
      return 1
    fi
  done < "$1"
}

mkdir -p "$dir"
for try in 1 2 3; do
  [ "$try" -eq 1 ] || echo "Starting again ($try of 3)" >&2
  inventory "$work/before"
  "${cli[@]}" db dump --db-url "$DB_URL" --data-only --schema public,auth -f "$dir/data.sql"
  inventory "$work/after"
  if ! cmp -s "$work/before.all" "$work/after.all"; then
    echo "The files changed while the rows were dumped" >&2
    continue
  fi
  fetch "$work/after" || continue
  inventory "$work/end"
  if ! cmp -s "$work/after.all" "$work/end.all"; then
    echo "The files changed while they were downloaded" >&2
    continue
  fi
  cut -f1 "$work/after" > "$dir/files.txt"
  echo "Backed up the rows and $(grep -c . "$dir/files.txt" || true) activity files"
  if [ -s "$work/after.refused" ]; then
    cp "$work/after.refused" "$dir/files.refused.txt"
    echo "Left out $(grep -c . "$dir/files.refused.txt") files whose names the backup does not accept; they are listed in files.refused.txt:" >&2
    cat "$dir/files.refused.txt" >&2
  fi
  exit 0
done
echo "The backup failed: the files kept changing, or one could not be downloaded. Run it again." >&2
exit 1

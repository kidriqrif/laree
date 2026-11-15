#!/usr/bin/env bash
# Upload the activity files of a backup (made by backup-files.sh) into a project's private bucket.
# Run it after the migrations are applied (they create the bucket) and the data is loaded.
#
#   SUPABASE_URL=... SUPABASE_SECRET_KEY=... scripts/restore-files.sh dump
set -euo pipefail

dir="${1:?usage: restore-files.sh <dir>}"
: "${SUPABASE_URL:?}" "${SUPABASE_SECRET_KEY:?}"
bucket=activity-files
shape='^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'

count=0
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if ! [[ "$name" =~ $shape ]] || [[ "$name" == *..* ]]; then
    echo "Refusing an unexpected file name in the backup: $name" >&2
    exit 1
  fi
  # x-upsert: running the restore twice is harmless.
  curl -fsS --retry 3 -o /dev/null -X POST \
    -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
    -H "Content-Type: application/octet-stream" -H "x-upsert: true" \
    --data-binary "@$dir/files/$name" \
    "$SUPABASE_URL/storage/v1/object/$bucket/$name"
  count=$((count + 1))
done < "$dir/files.txt"
echo "Restored $count activity files"

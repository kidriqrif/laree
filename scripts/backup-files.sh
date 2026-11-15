#!/usr/bin/env bash
# Download every original activity file from the private bucket into <dir>/files, and list them
# in <dir>/files.txt. A database dump holds only the files' names, not their bytes.
#
#   DB_URL=... SUPABASE_URL=... SUPABASE_SECRET_KEY=... scripts/backup-files.sh dump
#
# SUPABASE_SECRET_KEY is the project's secret (service role) key: the bucket is private.
set -euo pipefail

dir="${1:?usage: backup-files.sh <dir>}"
: "${DB_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SECRET_KEY:?}"
bucket=activity-files
# {athlete id}/{file name}: the only shape the app writes and the access rules allow.
shape='^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'

mkdir -p "$dir/files"
psql "$DB_URL" -v ON_ERROR_STOP=1 -At \
  -c "select name from storage.objects where bucket_id = '$bucket' order by name" > "$dir/files.txt"

count=0
while IFS= read -r name; do
  [ -n "$name" ] || continue
  if ! [[ "$name" =~ $shape ]] || [[ "$name" == *..* ]]; then
    echo "Refusing an unexpected file name in the bucket: $name" >&2
    exit 1
  fi
  mkdir -p "$dir/files/$(dirname "$name")"
  curl -fsS --retry 3 -o "$dir/files/$name" \
    -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
    "$SUPABASE_URL/storage/v1/object/$bucket/$name"
  count=$((count + 1))
done < "$dir/files.txt"
echo "Backed up $count activity files"

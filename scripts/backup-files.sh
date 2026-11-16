#!/usr/bin/env bash
# Download every original activity file from the private bucket into <dir>/files, and list them
# in <dir>/files.txt. A database dump holds only the files' names, not their bytes.
#
#   DB_URL=... SUPABASE_URL=... SUPABASE_SECRET_KEY=... scripts/backup-files.sh dump
#
# SUPABASE_SECRET_KEY is the project's secret (service role) key: the bucket is private.
# Run it after the database dump. The bucket is listed again after the downloads, until two
# listings agree, so the files match the bucket as it is when the backup ends: a file added
# meanwhile is fetched, and a file deleted meanwhile is dropped from the backup.
set -euo pipefail

dir="${1:?usage: backup-files.sh <dir>}"
: "${DB_URL:?}" "${SUPABASE_URL:?}" "${SUPABASE_SECRET_KEY:?}"
bucket=activity-files
# {athlete id}/{file name}: the only shape the app writes and the access rules allow.
shape='^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}$'

# The secret key goes out in a header: HTTPS only. Plain HTTP is for a stack on this machine,
# and only when ALLOW_LOCAL_HTTP=1 says so.
case "$SUPABASE_URL" in
  https://*) proto='=https' ;;
  http://127.0.0.1:* | http://localhost:*)
    [ "${ALLOW_LOCAL_HTTP:-}" = 1 ] || { echo "SUPABASE_URL is plain HTTP. Set ALLOW_LOCAL_HTTP=1 for a local stack." >&2; exit 1; }
    proto='=http' ;;
  *) echo "SUPABASE_URL must start with https://" >&2; exit 1 ;;
esac

list() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -At \
    -c "select name from storage.objects where bucket_id = '$bucket' order by name"
}

mkdir -p "$dir/files"
: > "$dir/files.txt"
for pass in 1 2 3 4 5; do
  list > "$dir/files.new"
  if [ "$pass" -gt 1 ] && cmp -s "$dir/files.new" "$dir/files.txt"; then
    rm "$dir/files.new"
    echo "Backed up $(grep -c . "$dir/files.txt" || true) activity files"
    exit 0
  fi
  # Gone from the bucket since the last listing: not part of this backup.
  comm -23 "$dir/files.txt" "$dir/files.new" | while IFS= read -r name; do
    [ -n "$name" ] && rm -f "$dir/files/$name"
  done
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    if ! [[ "$name" =~ $shape ]] || [[ "$name" == *..* ]]; then
      echo "Refusing an unexpected file name in the bucket: $name" >&2
      exit 1
    fi
    [ -f "$dir/files/$name" ] && continue
    mkdir -p "$dir/files/$(dirname "$name")"
    # A file deleted between the listing and this request is skipped: the next listing drops it.
    curl -fsS --proto "$proto" --retry 3 -o "$dir/files/$name" \
      -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" \
      "$SUPABASE_URL/storage/v1/object/$bucket/$name" || { rm -f "$dir/files/$name"; echo "Could not fetch $name; checking the bucket again" >&2; }
  done < "$dir/files.new"
  mv "$dir/files.new" "$dir/files.txt"
done
echo "The bucket kept changing during the backup, or a file could not be fetched. Run the backup again." >&2
exit 1

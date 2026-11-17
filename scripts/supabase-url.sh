# shellcheck shell=bash disable=SC2034 # proto is read by the scripts that source this file
# Sourced by backup.sh and restore-files.sh: checks SUPABASE_URL and sets `proto` for curl --proto.
#
# The secret key goes out in a header: HTTPS only. Plain HTTP is for a stack on this machine, and
# only when ALLOW_LOCAL_HTTP=1 says so. The address must be a bare origin with no user part
# ("user@"), so the host that curl talks to is the host checked here:
# http://localhost:123@example.invalid would otherwise pass as local and go to example.invalid.
check_supabase_url() {
  local url="$1"
  if [[ "$url" == *[@\\[:space:]]* ]]; then
    echo "SUPABASE_URL must not contain user information, a backslash or spaces" >&2
    return 1
  fi
  if [[ "$url" =~ ^https://[A-Za-z0-9.-]+(:[0-9]+)?/?$ ]]; then
    proto='=https'
  elif [[ "$url" =~ ^http://(127\.0\.0\.1|localhost)(:[0-9]+)?/?$ ]]; then
    if [ "${ALLOW_LOCAL_HTTP:-}" != 1 ]; then
      echo "SUPABASE_URL is plain HTTP. Set ALLOW_LOCAL_HTTP=1 for a local stack." >&2
      return 1
    fi
    proto='=http'
  else
    echo "SUPABASE_URL must be the project's address, such as https://REF.supabase.co" >&2
    return 1
  fi
}
